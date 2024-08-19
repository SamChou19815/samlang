import Link from 'next/link';
import StaticSamlangCodeBlock from '../components/StaticSamlangCodeBlock';
import {
  FOURTY_TWO,
  HELLO_WORLD_STRING,
  PATTERN_MATCHING,
  TYPE_INFERENCE,
} from '../components/samlang-programs';

export default function Home(): JSX.Element {
  return (
    <div>
      <main className="w-full overflow-hidden">
        <header
          className="my-4 mt-0 flex flex-col items-center bg-blue-500 px-8 py-12 text-white"
          id=""
        >
          <h1 className="my-8 flex text-6xl font-extralight">
            <img
              className="mr-3 rounded-full bg-white"
              src="/img/logo.png"
              alt="Logo"
              width="64px"
              height="64px"
            />
            samlang
          </h1>
          <p className="block text-left text-2xl font-light">
            A statically-typed, functional, and sound&nbsp;
            <br className="hidden sm:block" />
            programming language with type inference.
          </p>
          <div className="flex">
            <Link
              href="/demo"
              className="rounded-md m-4 p-2 w-32 text-xl text-center text-gray-800 bg-gray-100 hover:bg-slate-200"
            >
              Demo
            </Link>
            <a
              href="https://github.com/SamChou19815/samlang"
              target="_blank"
              rel="noreferrer"
              className="rounded-md m-4 p-2 w-32 text-xl text-center text-gray-800 bg-gray-100 hover:bg-slate-200"
            >
              GitHub
            </a>
          </div>
        </header>
        <section className="max-w-6xl mb-4 m-auto border border-solid border-gray-300 bg-white p-4">
          <h2>Introduction</h2>
          <p>
            samlang is a statically-typed functional programming language designed and implemented
            by Sam Zhou. The language is still under development so the syntax and semantics may be
            changed at any time.
          </p>
          <p>
            The language can be compiled down to WebAssembly with reference counting based garbage
            collection.
          </p>
          <h2>Getting Started</h2>
          <p>
            Download the latest release from{' '}
            <a href="https://github.com/SamChou19815/samlang/releases/latest">GitHub Releases</a>.
            To start a new project, create a json file <code>sconfig.json</code> with content{' '}
            <code>{'{}'}</code>.
          </p>
          <h2 id="example-programs">Notable Examples</h2>
          <section className="flex flex-wrap items-center">
            <div className="flex-grow-0 flex-shrink-0 flex-[100%] lg:flex-[50%] lg:max-w-[50%]">
              <h3>Hello World</h3>
              <div className="pr-2">
                <StaticSamlangCodeBlock>{HELLO_WORLD_STRING}</StaticSamlangCodeBlock>
              </div>
            </div>
            <div className="flex-grow-0 flex-shrink-0 flex-[100%] lg:flex-[50%] lg:max-w-[50%]">
              <h3>42</h3>
              <div className="pr-2">
                <StaticSamlangCodeBlock>{FOURTY_TWO}</StaticSamlangCodeBlock>
              </div>
            </div>
            <div className="flex-grow-0 flex-shrink-0 flex-[100%] lg:flex-[50%] lg:max-w-[50%]">
              <h3>Pattern Matching</h3>
              <div className="pr-2">
                <StaticSamlangCodeBlock>{PATTERN_MATCHING}</StaticSamlangCodeBlock>
              </div>
            </div>
            <div className="flex-grow-0 flex-shrink-0 flex-[100%] lg:flex-[50%] lg:max-w-[50%]">
              <h3>Type Inference</h3>
              <div className="pr-2">
                <StaticSamlangCodeBlock>{TYPE_INFERENCE}</StaticSamlangCodeBlock>
              </div>
            </div>
          </section>
          <h2>About the Documentation Site</h2>
          <p>
            This is an interactive documentation site where all the code snippets of samlang are
            editable. These snippets, available after the introduction section, contain inline
            comments to illustrate the power of the language.
          </p>
          <p>
            You can click the Demo button at the top of the page or follow{' '}
            <Link href="/demo">this link</Link>.
          </p>
          <h2>Power and Limits of Type Inference</h2>
          <p className="my-2">
            The only absolutely required type annotated happens at the top-level class function and
            method level. Most other types can be correctly inferred by the compiler and can be
            omitted from your program.
          </p>
          <p className="my-2">
            The type checker uses local type inference to infer types of most expressions.
            Therefore, it cannot infer types from the whole program like OCaml does. Instead, it
            will push down type hints from local, nearby contexts.
          </p>
          <p className="my-2">
            Despite the fundamental limitation, the compiler can correctly infer most of the local
            expression types. If your code does not use generics or unannotated lambda parameters,
            then all types can be inferred correctly. Most of the type arguments can be inferred, so
            they do not need to be explicitly supplied. Unannotated lambda parameters with local
            context but without parametric polymorphism can also be inferred perfectly.
          </p>
          <p>
            Even when you combine polymorphic function call and unannotated lambda parameters, the
            type checker still attempts to infer the types from left to right. It will work in most
            of the code. An illustratin type inference example is available near the top of the
            page.
          </p>
        </section>
      </main>
    </div>
  );
}
