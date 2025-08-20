const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
require("dotenv").config();

const routes = require("./routes/index");
const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");

const app = express();
const PORT = process.env.PORT || 3000;

// ---------- Middleware ----------
app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));

// ---------- Routes ----------
app.use("/api/v1", routes);

// ---------- Error Handling ----------
app.use(notFoundHandler);
app.use(errorHandler);

// ---------- Start Server ----------
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
