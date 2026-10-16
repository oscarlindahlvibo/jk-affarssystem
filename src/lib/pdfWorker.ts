// Egen arbetartråd för pdf.js: laddar reservlösningarna först, sedan pdf.js egna arbetarkod.
import "./pdfPolyfills";
import "pdfjs-dist/legacy/build/pdf.worker.min.mjs";
