// Los iconos y la librería del PDF entran por npm y los bundlea Vite: la app no pide nada fuera al abrirse.
// planner-export busca jsPDF en `window.jspdf`, así que se deja ahí.
import '@fortawesome/fontawesome-free/css/all.min.css';
import { jsPDF } from 'jspdf';

window.jspdf = { jsPDF };
