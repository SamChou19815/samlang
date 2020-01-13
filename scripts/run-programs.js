const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const basePath = './out/x86';

/**
 * @type {string[]}
 */
const programs = [];
fs.readdirSync(basePath).forEach(filename => {
    if (path.extname(filename) !== '.s') {
        const fullRelativePath = `${basePath}/${filename}`;
        try {
            fs.accessSync(fullRelativePath, fs.constants.X_OK);
            programs.push(fullRelativePath);
        } catch (_) { }
    }
});
programs.sort((a, b) => a.localeCompare(b));

programs.forEach(program => {
    console.log('#' + program);
    console.log(spawnSync(program).stdout.toString());
});
