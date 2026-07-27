export function logError(functionName, error) {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      function: functionName,
      message: error && error.message ? error.message : String(error),
      stack: error && error.stack ? error.stack : null
    };
    console.error("APP_ERROR:", entry);
  } catch (e) {
    console.error("APP_ERROR: failed to log error", e);
  }
}
