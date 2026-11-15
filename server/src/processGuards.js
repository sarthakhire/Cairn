// Last-resort logging so one stray promise or a database hiccup does not stop the server silently.
// By default Node ends the whole process on an unhandled rejection. Here it is logged and the
// server keeps serving. A real crash (an uncaught exception) is still left to stop the process,
// so the host restarts it with a clean state.
// install() returns a function that removes everything it added (used by the tests).
const rejectionLogger = (log) => (reason) => {
  log("unhandled rejection:", reason && reason.stack ? reason.stack : reason);
};

function install({ log = console.error } = {}) {
  const onRejection = rejectionLogger(log);
  process.on("unhandledRejection", onRejection);
  const undo = [() => process.off("unhandledRejection", onRejection)];

  let mongoose = null;
  try {
    mongoose = require("mongoose");
  } catch {
    mongoose = null;
  }
  if (mongoose) {
    const conn = mongoose.connection;
    const onError = (err) => log("mongo error:", err && err.message);
    const onDown = () => log("mongo disconnected");
    conn.on("error", onError);
    conn.on("disconnected", onDown);
    undo.push(() => {
      conn.off("error", onError);
      conn.off("disconnected", onDown);
    });
  }
  return () => undo.forEach((fn) => fn());
}

module.exports = { install, rejectionLogger };