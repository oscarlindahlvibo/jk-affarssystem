import { useEffect, useRef, useState, type DragEvent } from "react";
import { Link } from "react-router-dom";
import { Upload, FileText, CheckCircle2, AlertTriangle, ArrowLeft, ArrowRight, Loader2, Plus } from "lucide-react";
import { useStore } from "../data/store";
import { Panel } from "../components/ui/Panel";
import { Button } from "../components/ui/Button";
import { LtcGroupCard } from "../components/import/LtcGroupCard";
import { extractPdfRows, parseLtcOrder, rowsToText } from "../lib/ltcParse";
import { isUppdragslista, parseUppdragslista } from "../lib/uppdragslista";
import { MOCK_LTC_ORDER } from "../data/ltcMockOrder";
import { nextProjectNumber } from "../components/projects/NewProjectModal";
import { usePermissions } from "../lib/usePermissions";
import { canonicalCustomerName, normalizeCustomerName } from "../lib/importLogic";
import { useAuth } from "../lib/auth";
import { isCentralDriveEnabled, uploadCentralDriveFile } from "../lib/centralDrive";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import {
  analyzePdfForAi, fetchAiQuote, interpretWithAi, mapAiOrderToParsed, needsAiFallback, renderPdfPages, type AiQuote,
} from "../lib/aiInterpretation";
import {
  addSheetsToGroups,
  combinedDocumentRef,
  describeItem,
  findMatchingContact,
  moveSheet,
  projectCountForGroup,
  removeSheetsFromGroups,
  uniqueJoin,
  type EditableItem,
  type LtcGroup,
  type LtcSheet,
} from "../lib/ltcBatch";

type Step = 1 | 2 | 3;
interface AiCandidate {
  id: string;
  file: File;
  // Sidor som skickas (1-baserade) och totalt antal; kopior av samma sida hoppas över.
  pageNumbers: number[];
  totalPages: number;
  pages: number;
  tooLong: boolean;
  // Valt av användaren (inte för att texten saknas).
  chosen?: boolean;
}
interface AiOffer {
  candidates: AiCandidate[];
  held: LtcSheet[];
  quote: AiQuote;
}

export function OrderImportPage() {
  const store = useStore();
  const { currentProfile } = useAuth();
  const canImport = usePermissions().can("projects", "create");
  const [step, setStep] = useState<Step>(1);
  const [sheets, setSheets] = useState<LtcSheet[]>([]);
  const [groups, setGroups] = useState<LtcGroup[]>([]);
  const previewUrlsRef = useRef<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [parsing, setParsing] = useState<{ done: number; total: number } | null>(null);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [aiOffer, setAiOffer] = useState<AiOffer | null>(null);
  const [aiRunning, setAiRunning] = useState(false);
  // Användaren vill AI-tolka alla släppta dokument, även de med läsbar text.
  const [forceAi, setForceAi] = useState(false);
  const [reinterpretingId, setReinterpretingId] = useState<string | null>(null);
  // Stabilt request-id per dokument: ett omförsök efter nätverksfel debiteras aldrig två gånger.
  const aiRequestIds = useRef(new Map<string, string>());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; documentsSaved: number; documentsFailed: number; expectedDocuments: number; numbers: string[] } | null>(null);

  const ctx = { customers: store.customers, contacts: store.contactPersons };

  useEffect(() => () => {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  function trackPreview(file: File) {
    const url = URL.createObjectURL(file);
    previewUrlsRef.current.push(url);
    return url;
  }

  async function candidatePages(file: File) {
    const analysis = await analyzePdfForAi(file).catch(() => ({ total: 1, send: [1] }));
    return { pageNumbers: analysis.send, totalPages: analysis.total, pages: analysis.send.length };
  }

  // Vanlig textläsning av ett dokument (när AI inte används eller misslyckas för ett dokument användaren själv valt att AI-tolka).
  async function textSheets(file: File): Promise<LtcSheet[]> {
    try {
      const rows = await extractPdfRows(file);
      let orders = isUppdragslista(rows) ? parseUppdragslista(rows) : [];
      if (orders.length === 0) orders = [parseLtcOrder(rowsToText(rows))];
      const previewUrl = trackPreview(file);
      return orders.map((parsed) => ({ id: crypto.randomUUID(), file, fileName: file.name, parsed, previewUrl }));
    } catch {
      return [blankSheet(file)];
    }
  }

  function finishWith(toAdd: LtcSheet[]) {
    setAiOffer(null);
    if (toAdd.length === 0) return;
    setSheets((prev) => [...prev, ...toAdd]);
    setGroups((prev) => addSheetsToGroups(prev, toAdd, ctx));
    setStep(2);
  }

  function blankSheet(file: File): LtcSheet {
    return { id: crypto.randomUUID(), file, fileName: file.name, parsed: parseLtcOrder(""), previewUrl: trackPreview(file) };
  }

  async function handleFiles(fileList: FileList | File[]) {
    const all = Array.from(fileList);
    const files = all.filter((file) => file.type === "application/pdf" || /\.pdf$/i.test(file.name));
    const errors: string[] = all.filter((file) => !files.includes(file)).map((file) => `${file.name}: är inte en PDF och hoppades över.`);
    setParseErrors(errors);
    if (files.length === 0) return;
    const added: LtcSheet[] = [];
    const candidates: AiCandidate[] = [];
    setParsing({ done: 0, total: files.length });
    for (const [index, file] of files.entries()) {
      try {
        if (forceAi && isSupabaseConfigured) {
          candidates.push({ id: crypto.randomUUID(), file, ...(await candidatePages(file)), tooLong: false, chosen: true });
          setParsing({ done: index + 1, total: files.length });
          continue;
        }
        const rows = await extractPdfRows(file);
        let orders = isUppdragslista(rows) ? parseUppdragslista(rows) : [];
        if (orders.length === 0) {
          const parsed = parseLtcOrder(rowsToText(rows));
          if (needsAiFallback(rows, parsed)) {
            // Ingen läsbar text: erbjud AI-tolkning (efter kostnadsbesked) i stället för ett tomt blad.
            candidates.push({ id: crypto.randomUUID(), file, ...(await candidatePages(file)), tooLong: false });
            setParsing({ done: index + 1, total: files.length });
            continue;
          }
          if (parsed.items.length === 0 && !parsed.documentNumber) {
            errors.push(`${file.name}: kunde inte tolkas automatiskt. Kontrollera att PDF-filen har ett läsbart textlager. Bladet är med, fyll i uppgifterna manuellt eller välj Tolka om med AI.`);
          }
          orders = [parsed];
        }
        const previewUrl = trackPreview(file);
        for (const parsed of orders) added.push({ id: crypto.randomUUID(), file, fileName: file.name, parsed, previewUrl });
      } catch (error) {
        console.error(`Kunde inte läsa ${file.name}`, error);
        const reason = error instanceof Error && error.message ? ` (${error.message.slice(0, 140)})` : "";
        errors.push(`${file.name}: kunde inte läsas som PDF och hoppades över${reason}.`);
      }
      setParsing({ done: index + 1, total: files.length });
    }
    setParsing(null);

    if (candidates.length > 0) {
      let quote: AiQuote | null = null;
      if (isSupabaseConfigured) {
        try {
          quote = await fetchAiQuote();
        } catch (error) {
          errors.push(`AI-tolkning är inte tillgänglig just nu${error instanceof Error && error.message ? ` (${error.message.slice(0, 120)})` : ""}.`);
        }
      }
      if (quote) {
        const max = quote.max_pages_per_request;
        const marked = candidates.map((candidate) => ({ ...candidate, tooLong: candidate.pages > max }));
        setParseErrors([...errors]);
        setAiOffer({ candidates: marked, held: added, quote });
        setStep(1);
        return;
      }
      for (const candidate of candidates) {
        errors.push(`${candidate.file.name}: saknar läsbart textlager och kunde inte tolkas automatiskt. Bladet är med, fyll i uppgifterna manuellt.`);
        added.push(blankSheet(candidate.file));
      }
    }
    setParseErrors([...errors]);
    finishWith(added);
  }

  // Användaren avstår från AI: bladen läggs in tomma för manuell ifyllnad.
  async function declineAi() {
    if (!aiOffer) return;
    const offer = aiOffer;
    const fallback: LtcSheet[] = [];
    const notes: string[] = [];
    for (const candidate of offer.candidates) {
      if (candidate.chosen) {
        fallback.push(...(await textSheets(candidate.file)));
        notes.push(`${candidate.file.name}: lästes utan AI. Kontrollera uppgifterna.`);
      } else {
        fallback.push(blankSheet(candidate.file));
        notes.push(`${candidate.file.name}: lades in utan tolkning. Fyll i uppgifterna manuellt.`);
      }
    }
    setParseErrors((prev) => [...prev, ...notes]);
    finishWith([...offer.held, ...fallback]);
  }

  async function runAi() {
    if (!aiOffer || aiRunning) return;
    setAiRunning(true);
    const errors: string[] = [];
    const toAdd: LtcSheet[] = [...aiOffer.held];
    let billedPages = 0;
    for (const candidate of aiOffer.candidates) {
      if (candidate.tooLong) {
        errors.push(`${candidate.file.name}: har ${candidate.pages} sidor och kan inte AI-tolkas (högst ${aiOffer.quote.max_pages_per_request}). ${candidate.chosen ? "Lästes utan AI." : "Bladet är med, fyll i manuellt."}`);
        toAdd.push(...(candidate.chosen ? await textSheets(candidate.file) : [blankSheet(candidate.file)]));
        continue;
      }
      try {
        const images = await renderPdfPages(candidate.file, aiOffer.quote.max_pages_per_request, candidate.pageNumbers);
        if (!aiRequestIds.current.has(candidate.id)) aiRequestIds.current.set(candidate.id, crypto.randomUUID());
        const result = await interpretWithAi(candidate.file, images, aiRequestIds.current.get(candidate.id)!);
        if (result.billed) billedPages += result.pages;
        const previewUrl = trackPreview(candidate.file);
        for (const order of result.orders) toAdd.push({ id: crypto.randomUUID(), file: candidate.file, fileName: candidate.file.name, parsed: mapAiOrderToParsed(order, result.raw_text ?? ""), previewUrl, ai: true });
        if (result.orders.length === 0) toAdd.push(blankSheet(candidate.file));
        for (const warning of result.warnings) errors.push(`${candidate.file.name}: ${warning}`);
      } catch (error) {
        const message = error instanceof Error && error.message ? error.message : "AI-tolkningen misslyckades.";
        errors.push(`${candidate.file.name}: ${message} Ingen debitering har gjorts. ${candidate.chosen ? "Dokumentet lästes utan AI, kontrollera uppgifterna." : "Bladet är med, fyll i uppgifterna manuellt."}`);
        toAdd.push(...(candidate.chosen ? await textSheets(candidate.file) : [blankSheet(candidate.file)]));
      }
    }
    if (billedPages > 0) {
      errors.push(`AI-tolkade ${billedPages} ${billedPages === 1 ? "sida" : "sidor"}. Kontrollera alla uppgifter noga.`);
    }
    setAiRunning(false);
    setParseErrors((prev) => [...prev, ...errors]);
    finishWith(toAdd);
  }

  // Läser om ett redan tolkat blad med AI, t.ex. när textläsningen blev fel. Ersätter bladets uppgifter.
  async function reinterpretSheet(sheetId: string) {
    const sheet = sheets.find((s) => s.id === sheetId);
    if (!sheet?.file || reinterpretingId || aiRunning) return;
    const file = sheet.file;
    setReinterpretingId(sheetId);
    setParseErrors([]);
    try {
      const quote = await fetchAiQuote();
      const { total, send } = await analyzePdfForAi(file);
      const pages = send.length;
      if (pages > quote.max_pages_per_request) throw new Error(`${file.name} har ${pages} sidor. Högst ${quote.max_pages_per_request} sidor kan AI-tolkas.`);
      const ok = window.confirm(
        `Tolka om ${file.name} (${pages} ${pages === 1 ? "sida" : "sidor"}${total > pages ? `, ${total - pages} liknande sidor hoppas över` : ""}) med AI?\n\nAI-tolkning debiteras enligt gällande villkor. Uppgifter du redan ändrat för det här bladet ersätts. Du granskar alltid resultatet innan något skapas.`,
      );
      if (!ok) return;
      const images = await renderPdfPages(file, quote.max_pages_per_request, send);
      const requestKey = `reinterpret:${sheetId}`;
      if (!aiRequestIds.current.has(requestKey)) aiRequestIds.current.set(requestKey, crypto.randomUUID());
      const result = await interpretWithAi(file, images, aiRequestIds.current.get(requestKey)!, "high");
      const replaced = sheets.filter((s) => s.file === file).map((s) => s.id);
      const fresh: LtcSheet[] = result.orders.map((order) => ({
        id: crypto.randomUUID(), file, fileName: file.name, parsed: mapAiOrderToParsed(order, result.raw_text ?? ""), previewUrl: sheet.previewUrl, ai: true,
      }));
      if (fresh.length === 0) throw new Error("AI hittade ingen order i dokumentet. Inget har ändrats.");
      setSheets((prev) => [...prev.filter((s) => !replaced.includes(s.id)), ...fresh]);
      setGroups((prev) => addSheetsToGroups(removeSheetsFromGroups(prev, replaced), fresh, ctx));
      setParseErrors([`${file.name}: AI-tolkade ${result.pages} ${result.pages === 1 ? "sida" : "sidor"}. Kontrollera alla uppgifter noga.`, ...result.warnings.map((w) => `${file.name}: ${w}`)]);
    } catch (error) {
      setParseErrors([`${error instanceof Error && error.message ? error.message : "AI-tolkningen misslyckades."} Ingen debitering har gjorts för misslyckad tolkning.`]);
    } finally {
      setReinterpretingId(null);
    }
  }

  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes("Files");
  const dropHandlers = {
    onDragEnter: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current += 1;
      setDragging(true);
    },
    onDragOver: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = parsing ? "none" : "copy";
    },
    onDragLeave: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    },
    onDrop: (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      if (!parsing && !aiOffer && !aiRunning && event.dataTransfer.files.length > 0) void handleFiles(event.dataTransfer.files);
    },
  };

  function useExample() {
    setParseErrors([]);
    const sheet: LtcSheet = { id: crypto.randomUUID(), file: null, fileName: "Exempeldata (LTC-blad Holtab)", parsed: MOCK_LTC_ORDER, previewUrl: null };
    setSheets([sheet]);
    setGroups(addSheetsToGroups([], [sheet], ctx));
    setStep(2);
  }

  function updateGroup(id: string, patch: Partial<LtcGroup>) {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, ...patch } : g)));
  }

  function warningsFor(group: LtcGroup): string[] {
    const groupSheets = sheets.filter((s) => group.sheetIds.includes(s.id));
    const warnings: string[] = [];
    for (const sheet of groupSheets) {
      if (sheet.ai) warnings.push(`${sheet.fileName} är AI-tolkat. Kontrollera alla uppgifter extra noga.`);
      const number = sheet.parsed.documentNumber;
      if (!number) continue;
      const duplicatesInBatch = sheets.some((s) => s.id !== sheet.id && s.file !== sheet.file && s.parsed.documentNumber === number);
      if (duplicatesInBatch) warnings.push(`${number} förekommer flera gånger i den här importen.`);
      const existing = store.projects.find((p) => (p.source_document_ref ?? "").split(/\s*,\s*/).includes(number));
      if (existing) warnings.push(`${number} finns redan på projekt ${existing.project_number}.`);
    }
    return [...new Set(warnings)];
  }

  async function saveSourceDocument(file: File, projectId: string) {
    let storagePath: string | null = null;
    let fileUrl: string | null = null;
    let driveFileId: string | null = null;

    if (isCentralDriveEnabled) {
      const uploaded = await uploadCentralDriveFile(file, projectId);
      storagePath = `drive:${uploaded.id}`;
      fileUrl = uploaded.webViewLink;
      driveFileId = uploaded.id;
    } else if (isSupabaseConfigured && supabase) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      storagePath = `${projectId}/${crypto.randomUUID()}-${safeName}`;
      const uploaded = await supabase.storage.from("project-documents").upload(storagePath, file, {
        contentType: file.type || "application/pdf",
        upsert: false,
      });
      if (uploaded.error) throw new Error(uploaded.error.message);
      const signed = await supabase.storage.from("project-documents").createSignedUrl(storagePath, 60 * 60);
      if (signed.error) throw new Error(signed.error.message);
      fileUrl = signed.data.signedUrl;
    } else {
      fileUrl = URL.createObjectURL(file);
    }

    store.addDocument(projectId, {
      file_name: file.name,
      file_type: file.name.split(".").pop() ?? "pdf",
      category: "Order",
      storage_path: storagePath,
      file_url: fileUrl,
      file_size: file.size,
      drive_file_id: driveFileId,
      uploaded_at: new Date().toISOString(),
      uploaded_by: currentProfile?.full_name ?? "Okänd",
      visibility: "internal",
      comment: "Originaldokument från orderimport.",
    });
    await store.waitForPendingMutations();
  }

  async function handleCreate() {
    setCreating(true);
    setCreateError(null);
    let created = 0;
    let documentsSaved = 0;
    let documentsFailed = 0;
    let expectedDocuments = 0;
    const numbers: string[] = [];
    const completed = new Map<string, string[]>();
    let workingProjects = store.projects;
    const customerCache = new Map<string, string>();
    const contactCache = new Map<string, string>();
    let activeGroup: LtcGroup | null = null;
    let failedGroupId: string | null = null;
    const createdItems = new Set<EditableItem>();

    try {
      for (const group of groups) {
        if (group.done || projectCountForGroup(group) === 0) continue;
        activeGroup = group;
        createdItems.clear();
        const groupSheets = sheets.filter((s) => group.sheetIds.includes(s.id));
        const sheetById = new Map(groupSheets.map((s) => [s.id, s]));
        const order = group.order;

        let customerId = group.customerId;
        if (!customerId && group.newCustomerName.trim()) {
          const cacheKey = normalizeCustomerName(group.newCustomerName);
          const cached = customerCache.get(cacheKey);
          if (cached) {
            customerId = cached;
          } else {
            const createdCustomer = store.addCustomer({
              company_name: canonicalCustomerName(group.newCustomerName),
              org_number: null,
              invoice_address: null,
              visiting_address: null,
              phone: null,
              email: null,
              website: null,
              notes: "Skapad via orderimport.",
              status: "aktiv",
            });
            customerCache.set(cacheKey, createdCustomer.id);
            customerId = createdCustomer.id;
          }
        }
        if (!customerId) throw new Error(`Leverans ${groups.indexOf(group) + 1}: välj eller skapa en kund.`);

        let contactId = group.contactId;
        const contactName = (order.customerContact ?? order.recipientContact)?.trim();
        if (!contactId && contactName) {
          const contactKey = `${customerId}|${contactName.toLowerCase()}`;
          const cachedContact = contactCache.get(contactKey);
          const matched = cachedContact ? undefined : findMatchingContact(store.contactPersons, customerId, order);
          if (cachedContact) {
            contactId = cachedContact;
          } else if (matched) {
            contactId = matched.id;
          } else {
            const existing = store.contactPersons.filter((c) => c.customer_id === customerId);
            const createdContact = store.addContactPerson({
              customer_id: customerId,
              name: contactName,
              role: "Kontakt från order",
              phone: order.customerPhone ?? order.recipientPhone ?? null,
              mobile: order.customerPhone ? null : order.recipientMobile ?? null,
              email: order.recipientEmail ?? null,
              note: "Skapad via orderimport.",
              is_primary: existing.length === 0 && ![...contactCache.keys()].some((key) => key.startsWith(`${customerId}|`)),
            });
            contactId = createdContact.id;
          }
          contactCache.set(contactKey, contactId);
        }

        const customerName = store.customers.find((c) => c.id === customerId)?.company_name ?? (group.newCustomerName.trim() || "Kund");
        const included = group.items.filter((i) => i.include);
        const units: EditableItem[][] = group.mode === "single" ? [included] : included.map((i) => [i]);

        for (const unit of units) {
          const descriptions = unit.map((item) => describeItem(item));
          const firstDescription = descriptions[0] || "Transport";
          const name =
            unit.length > 1
              ? `${customerName} – ${firstDescription} m.fl. (${unit.length} godsrader)`
              : `${customerName} – ${firstDescription}`;
          const unitSheetIds = [...new Set(unit.map((i) => i.sheetId))];
          const unitSheets = unitSheetIds.map((id) => sheetById.get(id)).filter((s): s is LtcSheet => Boolean(s));
          const terms = uniqueJoin([group.deliveryTerms, ...unit.map((i) => i.deliveryTermsAddition)], " + ") || null;

          const newProject = store.addProject({
            project_number: nextProjectNumber(workingProjects),
            name,
            customer_id: customerId,
            contact_person_id: contactId || null,
            responsible_id: group.responsibleId || null,
            status: "Ny bokning",
            transport_type: group.transportType,
            special_requirements: null,
            delivery_terms: terms,
            planned_loading_date: group.loadingDate || null,
            planned_loading_time: group.loadingTime || null,
            planned_delivery_date: group.deliveryDate || null,
            planned_delivery_time: group.deliveryTime || null,
            supplier_id: group.supplierId || null,
            price: null,
            cost: null,
            invoice_status: "Ej fakturerad",
            customer_reference: uniqueJoin(unit.map((i) => i.orderRef), ", ") || null,
            source_document_ref: combinedDocumentRef(unitSheets.map((s) => s.parsed.documentNumber)),
            vehicle: null,
            driver_name: null,
            carrier_order_number: null,
            locations: [
              ...(group.loadingPlace ? [{ id: "loc-lastning", project_id: "", type: "lastning" as const, name: group.loadingPlace, address: null, company_name: group.loadingCompany || null, order_index: 0 }] : []),
              ...(group.unloadingPlace
                ? [{
                    id: "loc-lossning",
                    project_id: "",
                    type: "lossning" as const,
                    name: group.unloadingPlace,
                    address: null,
                    company_name: group.unloadingCompany || null,
                    contact_name: group.unloadingContactName || null,
                    contact_phone: group.unloadingContactPhone || null,
                    order_index: 1,
                  }]
                : []),
            ],
            cargo_items: unit.map((item, i) => ({
              id: `cargo-${i + 1}`,
              project_id: "",
              description: describeItem(item) || "Gods",
              length_m: item.length_m,
              width_m: item.width_m,
              height_m: item.height_m,
              weight_ton: item.weight_ton,
              quantity: item.quantity,
              lift_points: null,
              drawing_reference: item.orderRef,
              technical_info: null,
            })),
          });
          workingProjects = [...workingProjects, newProject];
          created++;
          numbers.push(newProject.project_number);
          unit.forEach((item) => createdItems.add(item));
          completed.set(group.id, [...(completed.get(group.id) ?? []), newProject.project_number]);
          await store.waitForPendingMutations();
          const filesToSave = [...new Set(unitSheets.map((sheet) => sheet.file))].filter((file): file is File => Boolean(file));
          for (const file of filesToSave) {
            expectedDocuments++;
            try {
              await saveSourceDocument(file, newProject.id);
              documentsSaved++;
            } catch (error) {
              console.error("Kunde inte spara orderoriginalet", error);
              documentsFailed++;
            }
          }
        }
        activeGroup = null;
      }
      setResult({ created, documentsSaved, documentsFailed, expectedDocuments, numbers });
      setStep(3);
    } catch (error) {
      failedGroupId = activeGroup?.id ?? null;
      const prefix = activeGroup ? `Leverans ${groups.findIndex((g) => g.id === activeGroup?.id) + 1}: ` : "";
      const alreadyDone = created > 0 ? ` ${created} projekt hann skapas (${numbers.join(", ")}) och skapas inte igen om du försöker på nytt.` : "";
      setCreateError(`${prefix}${error instanceof Error ? error.message : "Importen kunde inte slutföras."}${alreadyDone}`);
    } finally {
      setGroups((prev) =>
        prev.map((g) => {
          const projectNumbers = completed.get(g.id);
          if (!projectNumbers) return g;
          if (g.id === failedGroupId) {
            return { ...g, createdNumbers: [...g.createdNumbers, ...projectNumbers], items: g.items.map((i) => (createdItems.has(i) ? { ...i, include: false } : i)) };
          }
          return { ...g, createdNumbers: [...g.createdNumbers, ...projectNumbers], done: true };
        })
      );
      setCreating(false);
    }
  }

  function startOver() {
    previewUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrlsRef.current = [];
    setStep(1);
    setAiOffer(null);
    setSheets([]);
    setGroups([]);
    setResult(null);
    setParseErrors([]);
    setCreateError(null);
  }

  if (!canImport) {
    return <div className="py-20 text-center text-slate-500">Du har inte behörighet att importera order.</div>;
  }

  const pendingGroups = groups.filter((g) => !g.done);
  const totalProjects = pendingGroups.reduce((sum, g) => sum + projectCountForGroup(g), 0);
  const missingCustomer = pendingGroups.some((g) => projectCountForGroup(g) > 0 && !g.customerId && !g.newCustomerName.trim());
  const dropzone = (
    <label
      {...dropHandlers}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-12 text-center transition-colors ${
        dragging ? "border-orange-400 bg-orange-50" : "border-border bg-slate-50 hover:border-orange-300 hover:bg-orange-50/40"
      }`}
    >
      {parsing ? <Loader2 size={28} className="animate-spin text-slate-400" /> : <Upload size={28} className="text-slate-400" />}
      <div className="text-sm font-medium text-slate-700">
        {parsing ? `Läser dokument ${parsing.done} av ${parsing.total}...` : dragging ? "Släpp filerna här" : "Dra och släpp PDF:er här, eller klicka för att välja"}
      </div>
      <div className="text-xs text-slate-500">Digital fraktorder, LTC eller annat orderblad med läsbart textlager. Blad till samma ställe och datum slås ihop till en leverans.</div>
      <input
        type="file"
        accept=".pdf"
        multiple
        className="hidden"
        disabled={Boolean(parsing) || aiRunning || Boolean(aiOffer)}
        onChange={(e) => {
          if (e.target.files?.length) void handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex items-center gap-2">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${step === n ? "bg-orange-500 text-white" : step > n ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400"}`}>
              {step > n ? <CheckCircle2 size={14} /> : n}
            </div>
            <span className={`text-sm ${step === n ? "font-medium text-slate-800" : "text-slate-500"}`}>
              {n === 1 ? "Ladda upp order" : n === 2 ? "Granska och komplettera" : "Klart"}
            </span>
            {n < 3 && <div className="mx-2 h-px w-8 bg-border" />}
          </div>
        ))}
      </div>

      {step === 1 && (
        <Panel title="Steg 1: Ladda upp orderblad (PDF)">
          <div className="space-y-4">
            {dropzone}
            {isSupabaseConfigured && !aiOffer && (
              <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-0.5" checked={forceAi} disabled={Boolean(parsing) || aiRunning} onChange={(e) => setForceAi(e.target.checked)} />
                <span>Tolka dokumenten med AI, även när de har läsbar text <span className="text-slate-500">(för format som den vanliga tolkningen inte klarar). Debiteras enligt gällande villkor.</span></span>
              </label>
            )}
            {aiOffer && (() => {
              const billable = aiOffer.candidates.filter((candidate) => !candidate.tooLong);
              const pages = billable.reduce((sum, candidate) => sum + candidate.pages, 0);
              return (
                <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900" role="region" aria-label="AI-tolkning">
                  <p className="font-semibold">{aiOffer.candidates.every((candidate) => candidate.chosen)
                      ? `Du har valt AI-tolkning för ${aiOffer.candidates.length === 1 ? "dokumentet" : `${aiOffer.candidates.length} dokument`}.`
                      : aiOffer.candidates.length === 1 ? "Dokumentet saknar läsbar text. AI kan läsa det från bilden." : `${aiOffer.candidates.length} dokument saknar läsbar text. AI kan läsa dem från bilden.`}</p>
                  <ul className="list-disc pl-5">
                    {aiOffer.candidates.map((candidate) => (
                      <li key={candidate.id}>{candidate.file.name}: {candidate.pages} {candidate.pages === 1 ? "sida" : "sidor"}{candidate.totalPages > candidate.pages ? ` (${candidate.totalPages - candidate.pages} liknande ${candidate.totalPages - candidate.pages === 1 ? "sida" : "sidor"} hoppas över)` : ""}{candidate.tooLong ? ` (för många för AI, högst ${aiOffer.quote.max_pages_per_request})` : ""}</li>
                    ))}
                  </ul>
                  {pages > 0 ? (
                    <p>
                      AI-tolkning ({pages} {pages === 1 ? "sida" : "sidor"}) debiteras enligt gällande villkor. Du debiteras bara om tolkningen lyckas, och du granskar alltid resultatet innan något skapas.
                    </p>
                  ) : <p>Inget av dokumenten kan AI-tolkas.</p>}
                  {aiOffer.quote.monthly_page_limit !== null && <p className="text-xs">Månadsgräns: {aiOffer.quote.month_pages_used} av {aiOffer.quote.monthly_page_limit} sidor använda.</p>}
                  <div className="flex flex-wrap gap-2">
                    {pages > 0 && <Button type="button" disabled={aiRunning} onClick={() => void runAi()}>{aiRunning ? <><Loader2 size={14} className="animate-spin" /> Tolkar…</> : "Tolka med AI"}</Button>}
                    <Button type="button" variant="secondary" disabled={aiRunning} onClick={() => void declineAi()}>{aiOffer.candidates.every((candidate) => candidate.chosen) ? "Fortsätt utan AI (vanlig textläsning)" : "Fortsätt utan AI (fyll i manuellt)"}</Button>
                  </div>
                </div>
              );
            })()}
            {parseErrors.map((message) => <p key={message} className="text-sm text-red-600">{message}</p>)}
            <div className="flex items-center gap-3 text-xs text-slate-400">
              <div className="h-px flex-1 bg-border" /> eller <div className="h-px flex-1 bg-border" />
            </div>
            <button onClick={useExample} className="flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-white py-3 text-sm font-medium text-slate-700 hover:bg-slate-50">
              <FileText size={16} className="text-orange-500" />
              Använd exempeldata (LTC-blad Holtab)
            </button>
          </div>
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-slate-50 p-4 text-xs text-slate-500">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            Text-PDF:er tolkas lokalt i webbläsaren. Saknar PDF:en läsbar text (skannad eller utskriven som bild) kan du välja AI-tolkning,
            som debiteras per sida och bara när den lyckas. Tolkningen är en bästa möjliga läsning – kontrollera och komplettera alltid
            uppgifterna i nästa steg innan projekt skapas.
          </div>
        </Panel>
      )}

      {step === 2 && groups.length > 0 && (
        <div {...dropHandlers} className={`rounded-xl ${dragging ? "outline outline-2 outline-offset-4 outline-orange-400" : ""}`}>
        <Panel
          title={`Steg 2: Granska och komplettera (${sheets.length} blad, ${groups.length} ${groups.length === 1 ? "leverans" : "leveranser"})`}
          action={
            <label className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-orange-600 hover:text-orange-700">
              {parsing ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Lägg till fler blad (eller släpp filer här)
              <input type="file" accept=".pdf" multiple className="hidden" disabled={Boolean(parsing)} onChange={(e) => { if (e.target.files?.length) void handleFiles(e.target.files); e.target.value = ""; }} />
            </label>
          }
        >
          <div className="space-y-4">
            {parseErrors.map((message) => <p key={message} className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{message}</p>)}
            {groups.length > 1 && (
              <p className="text-xs text-slate-500">
                Blad till samma kund, lossningsplats och lossningsdatum har föreslagits som en leverans. Flytta ett blad mellan leveranser med "Flytta till..." om förslaget inte stämmer.
              </p>
            )}
            {groups.map((group, index) => (
              <LtcGroupCard
                key={group.id}
                index={index}
                groupCount={groups.length}
                group={group}
                sheets={sheets.filter((s) => group.sheetIds.includes(s.id))}
                allGroups={groups}
                warnings={warningsFor(group)}
                customers={store.customers}
                contactPersons={store.contactPersons}
                suppliers={store.suppliers}
                profiles={store.profiles}
                onChange={(patch) => updateGroup(group.id, patch)}
                onMoveSheet={(sheetId, target) => setGroups((prev) => moveSheet(prev, sheets, sheetId, target, ctx))}
                onReinterpret={isSupabaseConfigured ? (sheetId) => void reinterpretSheet(sheetId) : undefined}
                reinterpretingId={reinterpretingId}
              />
            ))}
          </div>

          <div className="mt-5 flex justify-between border-t border-border pt-4">
            <Button variant="secondary" onClick={startOver}><ArrowLeft size={14} /> Börja om</Button>
            <Button onClick={() => void handleCreate()} disabled={creating || totalProjects === 0 || missingCustomer}>
              {creating ? <Loader2 size={14} className="animate-spin" /> : null}
              {creating ? "Skapar projekt och sparar orderblad..." : `Skapa ${totalProjects} ${totalProjects === 1 ? "projekt" : "projekt"}`} {!creating && <ArrowRight size={14} />}
            </Button>
          </div>
          {missingCustomer && <p className="mt-3 text-xs text-amber-700">Välj eller ange en kund för alla leveranser innan du skapar projekten.</p>}
          {createError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{createError}</p>}
        </Panel>
        </div>
      )}

      {result && step === 3 && (
        <Panel title="Import klar">
          <div className="flex items-start gap-3 rounded-lg bg-green-50 p-4 text-sm text-green-700">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-medium">Importen är klar.</div>
              <div className="mt-1 text-green-700/90">{result.created} projekt skapade: {result.numbers.join(", ")}.</div>
              {result.expectedDocuments > 0 && (
                <div className="mt-1 text-green-700/90">{result.documentsSaved} orderoriginal sparades på projekten.</div>
              )}
              {result.documentsFailed > 0 && (
                <div className="mt-2 rounded-md bg-amber-100 px-3 py-2 text-amber-800">
                  {result.documentsFailed} orderoriginal kunde inte sparas. Projekten är skapade och filerna kan laddas upp manuellt under Dokument.
                </div>
              )}
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Link to="/projekt"><Button>Till projektlistan</Button></Link>
            <Button variant="secondary" onClick={startOver}>Importera nya order</Button>
          </div>
        </Panel>
      )}
    </div>
  );
}
