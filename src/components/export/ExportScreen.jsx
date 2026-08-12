import ExportConfirmDialog from "./ExportConfirmDialog.jsx";
import ExportProgressDialog from "./ExportProgressDialog.jsx";

// Renders the export workflow as a dedicated screen while preserving the editor state.
export default function ExportScreen({
  isExporting,
  confirmProps,
  progressProps
}) {
  if (isExporting) {
    return <ExportProgressDialog isVisible {...progressProps} />;
  }

  return <ExportConfirmDialog isVisible {...confirmProps} />;
}
