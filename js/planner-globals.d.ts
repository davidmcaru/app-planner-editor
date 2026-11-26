// jsPDF entra por npm, y js/planner-libs.ts lo deja en `window.jspdf`, que es donde lo busca planner-export
interface Window {
    jspdf?: { jsPDF: typeof import('jspdf').jsPDF };
}
