import serve from "rollup-plugin-serve";
import livereload from "rollup-plugin-livereload";

// rollup.config.js
export default {
  input: "frontend/src/js/main.js",
  output: {
    file: "frontend/public/js/main.js",
    format: "esm",
  },
  plugins: [
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
