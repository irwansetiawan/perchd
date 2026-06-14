const port = process.env.PORT || 3000;
require("http").createServer((_, res) => res.end("ok")).listen(port);
