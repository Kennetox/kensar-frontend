export const LABEL_AGENT_FORMAT_STORAGE_KEY = "kensar_labels_pilot_format";

export const LABEL_AGENT_BASE_URL = "http://127.0.0.1:5177";
export const LABEL_AGENT_HEALTH_URL = `${LABEL_AGENT_BASE_URL}/health`;
export const LABEL_AGENT_UI_URL = `${LABEL_AGENT_BASE_URL}/ui`;
export const LABEL_AGENT_DEFAULT_PRINT_URL = `${LABEL_AGENT_BASE_URL}/print`;
export const LABEL_AGENT_DEFAULT_FORMAT = "Kensar";
export const LABEL_AGENT_FORMAT_PRESETS = ["Kensar", "Cables", "Tecnico"] as const;

export const LABEL_AGENT_WINDOWS_DOWNLOAD_URL =
  "https://github.com/Kennetox/Kensar-print-agent-tray/releases/latest/download/KensarPrintAgent-Setup-0.1.0.exe";
