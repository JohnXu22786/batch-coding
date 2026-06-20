const assert = require('assert');
const fs = require('fs');
const path = require('path');

const HELLO_FILE = path.join(__dirname, 'hello.txt');
const EXPECTED_CONTENT = '你好';

let allPassed = true;

try {
  // Test 1: File exists
  assert.ok(fs.existsSync(HELLO_FILE), `FAIL: ${HELLO_FILE} should exist`);
  console.log('✓ Test 1 passed: hello.txt exists');

  // Test 2: File content matches
  const actualContent = fs.readFileSync(HELLO_FILE, 'utf-8');
  assert.strictEqual(actualContent, EXPECTED_CONTENT, `FAIL: content should be "${EXPECTED_CONTENT}", got "${actualContent}"`);
  console.log('✓ Test 2 passed: content is "你好"');
} catch (err) {
  console.error(err.message);
  allPassed = false;
}

if (allPassed) {
  console.log('\n✅ All tests passed!');
  process.exit(0);
} else {
  console.log('\n❌ Some tests failed.');
  process.exit(1);
}
