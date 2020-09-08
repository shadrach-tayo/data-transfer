import serve from "rollup-plugin-serve";
import livereload from "rollup-plugin-livereload";
import replace from "rollup-plugin-replace";


// rollup.config.js
export default {
  input: "frontend/src/js/main.js",
  output: {
    file: "frontend/public/js/main.js",
    format: "esm",
  },
  plugins: [
    replace({
      deliminters: ["{{", "}}"],
      SOCKET_URL: "wss://localhost:8000",
    }),
    serve({
      open: true,
      openPage: "/",
      host: "localhost",
      port: 3003,
      contentBase: ["frontend/public"],
    }),
    livereload({
      watch: ["frontend/public"],
      exts: ["html", "js", "css"],
    }),
  ],
};
