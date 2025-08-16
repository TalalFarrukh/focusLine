// 404 Handler
const notFoundHandler = (req, res, next) => {
    res.status(404).json({
        error: "Route not found",
    });
};

// General Error Handler
const errorHandler = (err, req, res, next) => {
    console.error(err.stack);

    res.status(err.status || 500).json({
        error: {
            message: err.message || "Internal Server Error",
        },
    });
};

module.exports = { notFoundHandler, errorHandler }; 