const demoObject = require('./samlang-demo').samlang.demo;
const runDemo = demoObject[Object.keys(demoObject).filter((it) => it.startsWith('runDemo'))[0]];

module.exports = runDemo;
