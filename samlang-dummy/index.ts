// This file has no runtime use.
// It's only purpose is to import all top-level constructs,
// so that we can run tsc on it to type check everything at once.

// eslint-disable-next-line import/no-internal-modules
import main from '@dev-sam/samlang-cli/src/main';
// eslint-disable-next-line import/no-internal-modules
import runSamlangDemo from '@dev-sam/samlang-demo/src';

runSamlangDemo('');
main();
