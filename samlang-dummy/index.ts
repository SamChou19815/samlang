// This file has no runtime use.
// It's only purpose is to import all top-level constructs,
// so that we can run tsc on it to type check everything at once.

// eslint-disable-next-line import/no-internal-modules
import cliMainRunner from '@dev-sam/samlang-cli/src';
// eslint-disable-next-line import/no-internal-modules
import runSamlangDemo from '@dev-sam/samlang-demo/src';

runSamlangDemo('');
cliMainRunner({ format() {}, typeCheck() {}, compile() {}, lsp() {}, version() {}, help() {} }, []);
