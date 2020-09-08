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
      SOCKET_URL: "",
    }),
  ],
};
