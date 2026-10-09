import { runStdio } from "./lib/wire.mjs";
import { createReflect } from "./lib/reflect.mjs";

runStdio((api) => createReflect(api));
