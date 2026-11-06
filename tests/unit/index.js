"use strict";
// Lets `node --test tests/unit` work on Node 22 (a directory argument resolves to this index).
// `node --test "tests/unit/*.test.js"` runs the same files directly.
require("./lensiq-track.test.js");
require("./lensiq-camera.test.js");
require("./lensiq-detect.test.js");
require("./signage.test.js");
require("./checkout.test.js");
require("./driver.test.js");
require("./booth.test.js");
require("./single-subject.test.js");
require("./store.test.js");
require("./insights.test.js");
