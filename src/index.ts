/** @format */

import initApp from "./server";
import http from "http";
import https from "https";
import fs from "fs";
import { initSocket } from "./services/socket.service";

const port = process.env.PORT;

initApp().then((app) => {
  let server;
  if (process.env.NODE_ENV !== "production") {
    console.log("development");
    server = http.createServer(app);
  } else {
    const options = {
      key: fs.readFileSync("./client-key.pem"),
      cert: fs.readFileSync("./client-cert.pem"),
    };
    server = https.createServer(options, app);
  }

  // Initialize Socket.IO
  initSocket(server);

  server.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
});
