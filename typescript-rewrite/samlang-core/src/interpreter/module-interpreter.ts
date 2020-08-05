import { EXPRESSION_LAMBDA } from '../ast/lang/samlang-expressions';
import { SamlangModule, ClassDefinition } from '../ast/lang/samlang-toplevel';
import ExpressionInterpreter from './expression-interpreter';
import { InterpretationContext, EMPTY, ClassValue } from './interpretation-context';
import PanicException from './panic-exception';
import { Value, FunctionValue } from './value';

/** The interpreter used to evaluate an already type checked source with single module. */
export default class ModuleInterpreter {
  private expressionInterpreter: ExpressionInterpreter = new ExpressionInterpreter();

  printed = (): string => this.expressionInterpreter.printed();

  /**
   * Run the [module] under some interpretation [context] (default to empty)
   * to get all printed strings or a [PanicException].
   */
  run = (module: SamlangModule, context: InterpretationContext = EMPTY): string => {
    this.eval(module, context);
    console.log(this.printed());
    return this.printed();
  };

  /**
   * Evaluate the [module] under some interpretation [context] (default to empty)
   * to either a value or a [PanicException].
   */
  eval = (module: SamlangModule, context: InterpretationContext = EMPTY): Value => {
    try {
      return this.unsafeEval(module, context);
    } catch (e) {
      throw new PanicException('Interpreter Error.');
    }
  };

  /**
   * Evaluate the module directly, without considering stack overflow and other errors beyond our control.
   */
  private unsafeEval = (module: SamlangModule, context: InterpretationContext): Value => {
    const fullCtx = module.classes.reduce(
      (newContext, classDefinition) => this.evalContext(classDefinition, newContext),
      context
    );
    if (!fullCtx.classes.Main) {
      return { type: 'unit' };
    }
    const mainModule = fullCtx.classes.Main;
    if (!mainModule.functions.main) {
      return { type: 'unit' };
    }
    const mainFunction = mainModule.functions.main;
    if (mainFunction.arguments.length > 0) {
      return { type: 'unit' };
    }
    return this.expressionInterpreter.eval(mainFunction.body, mainFunction.context);
  };

  private evalContext = (
    classDefinition: ClassDefinition,
    context: InterpretationContext
  ): InterpretationContext => {
    const functions: Record<string, FunctionValue> = {};
    const methods: Record<string, FunctionValue> = {};
    classDefinition.members.forEach((member) => {
      const lambda = EXPRESSION_LAMBDA({
        range: member.range,
        type: member.type,
        parameters: member.parameters.map(({ name, type }) => [name, type]),
        captured: {},
        body: member.body,
      });
      const value = this.expressionInterpreter.eval(lambda, context) as FunctionValue;
      if (member.isMethod) {
        methods[member.name] = value;
      } else {
        functions[member.name] = value;
      }
    });
    const newModule: ClassValue = {
      functions,
      methods,
    };
    const newContext = {
      ...context,
      classes: {
        ...context.classes,
        [classDefinition.name]: newModule,
      },
    };
    // patch the functions and methods with correct context.
    Object.keys(functions).forEach((key) => {
      functions[key].context = newContext;
    });
    Object.keys(methods).forEach((key) => {
      methods[key].context = newContext;
    });
    return newContext;
  };
}
