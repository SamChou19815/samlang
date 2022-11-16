// @author meganyin13
// @origin https://github.com/SamChou19815/samlang/pull/35

import {
  SamlangExpression,
  SamlangModule,
  SourceClassDefinition,
  SourceExpressionLambda,
  SourceId,
} from "../ast/samlang-nodes";
import { checkNotNull } from "../utils";
import ExpressionInterpreter, {
  ClassValue,
  createDefaultInterpretationContext,
  FunctionValue,
  InterpretationContext,
  PanicException,
  Value,
} from "./expression-interpreter";

/** The interpreter used to evaluate an already type checked source with single module. */
export default class ModuleInterpreter {
  private printerCollector = "";
  private expressionInterpreter: ExpressionInterpreter = new ExpressionInterpreter();

  printed = (): string => this.printerCollector;

  private defaultContext: InterpretationContext = createDefaultInterpretationContext((value) => {
    this.printerCollector += `${value}\n`;
  });

  /**
   * Run the [module] under some interpretation [context] (default to empty)
   * to get all printed strings or a [PanicException].
   */
  run = (module: SamlangModule, context: InterpretationContext = this.defaultContext): string => {
    this.eval(module, context);
    return this.printed();
  };

  /**
   * Evaluate the [module] under some interpretation [context] (default to empty)
   * to either a value or a [PanicException].
   */
  eval = (module: SamlangModule, context: InterpretationContext = this.defaultContext): Value => {
    try {
      return this.unsafeEval(module, context);
    } catch (e) {
      throw new PanicException("Interpreter Error.");
    }
  };

  /**
   * Evaluate the module directly, without considering stack overflow and other errors beyond our control.
   */
  private unsafeEval = (module: SamlangModule, context: InterpretationContext): Value => {
    const fullCtx = module.classes.reduce(
      (newContext, classDefinition) => this.evalContext(classDefinition, newContext),
      context,
    );
    const mainModule = fullCtx.classes.get("Main");
    if (!mainModule) {
      return { type: "unit" };
    }
    const mainFunction = mainModule.functions.get("main");
    if (!mainFunction) {
      return { type: "unit" };
    }
    if (mainFunction.arguments.length > 0) {
      return { type: "unit" };
    }
    return this.expressionInterpreter.eval(mainFunction.body as SamlangExpression, fullCtx);
  };

  evalContext = (
    classDefinition: SourceClassDefinition,
    context: InterpretationContext,
  ): InterpretationContext => {
    const functions = new Map<string, FunctionValue>();
    const methods = new Map<string, FunctionValue>();
    classDefinition.members.forEach((member) => {
      const lambda = SourceExpressionLambda({
        location: member.location,
        type: member.type,
        parameters: member.parameters.map(({ name, type }) => ({
          name: SourceId(name),
          typeAnnotation: type,
        })),
        captured: new Map(),
        body: member.body,
      });
      const value = this.expressionInterpreter.eval(lambda, context) as FunctionValue;
      if (member.isMethod) {
        methods.set(member.name.name, value);
      } else {
        functions.set(member.name.name, value);
      }
    });
    const newModule: ClassValue = {
      functions,
      methods,
    };
    const newContext: InterpretationContext = {
      ...context,
      classes: new Map([...Array.from(context.classes), [classDefinition.name.name, newModule]]),
    };
    if (classDefinition.typeDefinition.type === "object") {
      functions.set("init", {
        type: "functionValue",
        arguments: [...classDefinition.typeDefinition.names.map((it) => it.name)],
        body: (localContext) => {
          const objectContent = new Map<string, Value>();
          classDefinition.typeDefinition.names.forEach(({ name }) => {
            objectContent.set(name, checkNotNull(localContext.localValues.get(name)));
          });
          return { type: "object", objectContent };
        },
        captured: new Map(),
      });
    } else {
      classDefinition.typeDefinition.names.forEach(({ name: tag }) => {
        functions.set(tag, {
          type: "functionValue",
          arguments: ["data"],
          body: (localContext) => ({
            type: "variant",
            tag,
            data: checkNotNull(localContext.localValues.get("data")),
          }),
          captured: new Map(),
        });
      });
    }
    return newContext;
  };
}
