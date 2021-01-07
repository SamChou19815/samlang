import createHighIRFlexibleOrderOperatorNode from '../hir-flexible-op';

import {
  HighIRExpression,
  HIR_ZERO,
  HIR_ONE,
  HIR_NAME,
  HIR_VARIABLE,
  HIR_INDEX_ACCESS,
  HIR_BINARY,
} from 'samlang-core-ast/hir-expressions';
import { HIR_INT_TYPE } from 'samlang-core-ast/hir-types';

const IMMUTABLE_MEM = (e: HighIRExpression, index = 0): HighIRExpression =>
  HIR_INDEX_ACCESS({ type: HIR_INT_TYPE, expression: e, index });

it('createMidIRFlexibleOrderOperatorNode test', () => {
  expect(createHighIRFlexibleOrderOperatorNode('+', HIR_ZERO, HIR_ONE)).toEqual(
    HIR_BINARY({ operator: '+', e1: HIR_ONE, e2: HIR_ZERO })
  );
  expect(createHighIRFlexibleOrderOperatorNode('+', HIR_ZERO, HIR_ZERO)).toEqual(
    HIR_BINARY({ operator: '+', e1: HIR_ZERO, e2: HIR_ZERO })
  );
  expect(createHighIRFlexibleOrderOperatorNode('+', HIR_ONE, HIR_ZERO)).toEqual(
    HIR_BINARY({ operator: '+', e1: HIR_ONE, e2: HIR_ZERO })
  );
  expect(createHighIRFlexibleOrderOperatorNode('+', HIR_ZERO, HIR_NAME('', HIR_INT_TYPE))).toEqual(
    HIR_BINARY({ operator: '+', e1: HIR_NAME('', HIR_INT_TYPE), e2: HIR_ZERO })
  );
  expect(
    createHighIRFlexibleOrderOperatorNode('+', HIR_ZERO, HIR_VARIABLE('', HIR_INT_TYPE))
  ).toEqual(HIR_BINARY({ operator: '+', e1: HIR_VARIABLE('', HIR_INT_TYPE), e2: HIR_ZERO }));
  expect(
    createHighIRFlexibleOrderOperatorNode(
      '+',
      HIR_ZERO,
      IMMUTABLE_MEM(HIR_VARIABLE('', HIR_INT_TYPE))
    )
  ).toEqual(
    HIR_BINARY({ operator: '+', e1: IMMUTABLE_MEM(HIR_VARIABLE('', HIR_INT_TYPE)), e2: HIR_ZERO })
  );
  expect(
    createHighIRFlexibleOrderOperatorNode(
      '+',
      HIR_ZERO,
      HIR_BINARY({
        operator: '+',
        e1: HIR_VARIABLE('', HIR_INT_TYPE),
        e2: HIR_VARIABLE('', HIR_INT_TYPE),
      })
    )
  ).toEqual(
    HIR_BINARY({
      operator: '+',
      e1: HIR_BINARY({
        operator: '+',
        e1: HIR_VARIABLE('', HIR_INT_TYPE),
        e2: HIR_VARIABLE('', HIR_INT_TYPE),
      }),
      e2: HIR_ZERO,
    })
  );

  expect(createHighIRFlexibleOrderOperatorNode('+', HIR_NAME('', HIR_INT_TYPE), HIR_ZERO)).toEqual(
    HIR_BINARY({ operator: '+', e1: HIR_NAME('', HIR_INT_TYPE), e2: HIR_ZERO })
  );
  expect(
    createHighIRFlexibleOrderOperatorNode(
      '+',
      HIR_NAME('a', HIR_INT_TYPE),
      HIR_NAME('b', HIR_INT_TYPE)
    )
  ).toEqual(
    HIR_BINARY({ operator: '+', e1: HIR_NAME('b', HIR_INT_TYPE), e2: HIR_NAME('a', HIR_INT_TYPE) })
  );
  expect(
    createHighIRFlexibleOrderOperatorNode(
      '+',
      HIR_NAME('', HIR_INT_TYPE),
      HIR_VARIABLE('', HIR_INT_TYPE)
    )
  ).toEqual(
    HIR_BINARY({
      operator: '+',
      e1: HIR_VARIABLE('', HIR_INT_TYPE),
      e2: HIR_NAME('', HIR_INT_TYPE),
    })
  );
  expect(
    createHighIRFlexibleOrderOperatorNode(
      '+',
      HIR_NAME('', HIR_INT_TYPE),
      IMMUTABLE_MEM(HIR_VARIABLE('', HIR_INT_TYPE))
    )
  ).toEqual(
    HIR_BINARY({
      operator: '+',
      e1: IMMUTABLE_MEM(HIR_VARIABLE('', HIR_INT_TYPE)),
      e2: HIR_NAME('', HIR_INT_TYPE),
    })
  );
  expect(
    createHighIRFlexibleOrderOperatorNode(
      '+',
      HIR_NAME('', HIR_INT_TYPE),
      HIR_BINARY({
        operator: '+',
        e1: HIR_VARIABLE('', HIR_INT_TYPE),
        e2: HIR_VARIABLE('', HIR_INT_TYPE),
      })
    )
  ).toEqual(
    HIR_BINARY({
      operator: '+',
      e1: HIR_BINARY({
        operator: '+',
        e1: HIR_VARIABLE('', HIR_INT_TYPE),
        e2: HIR_VARIABLE('', HIR_INT_TYPE),
      }),
      e2: HIR_NAME('', HIR_INT_TYPE),
    })
  );

  expect(
    createHighIRFlexibleOrderOperatorNode('+', HIR_VARIABLE('', HIR_INT_TYPE), HIR_ZERO)
  ).toEqual(HIR_BINARY({ operator: '+', e1: HIR_VARIABLE('', HIR_INT_TYPE), e2: HIR_ZERO }));
  expect(
    createHighIRFlexibleOrderOperatorNode(
      '+',
      HIR_VARIABLE('a', HIR_INT_TYPE),
      HIR_NAME('b', HIR_INT_TYPE)
    )
  ).toEqual(
    HIR_BINARY({
      operator: '+',
      e1: HIR_VARIABLE('a', HIR_INT_TYPE),
      e2: HIR_NAME('b', HIR_INT_TYPE),
    })
  );
  expect(
    createHighIRFlexibleOrderOperatorNode(
      '+',
      HIR_VARIABLE('a', HIR_INT_TYPE),
      HIR_VARIABLE('b', HIR_INT_TYPE)
    )
  ).toEqual(
    HIR_BINARY({
      operator: '+',
      e1: HIR_VARIABLE('b', HIR_INT_TYPE),
      e2: HIR_VARIABLE('a', HIR_INT_TYPE),
    })
  );
  expect(
    createHighIRFlexibleOrderOperatorNode(
      '+',
      HIR_VARIABLE('', HIR_INT_TYPE),
      IMMUTABLE_MEM(HIR_VARIABLE('', HIR_INT_TYPE))
    )
  ).toEqual(
    HIR_BINARY({
      operator: '+',
      e1: IMMUTABLE_MEM(HIR_VARIABLE('', HIR_INT_TYPE)),
      e2: HIR_VARIABLE('', HIR_INT_TYPE),
    })
  );
  expect(
    createHighIRFlexibleOrderOperatorNode(
      '+',
      HIR_VARIABLE('', HIR_INT_TYPE),
      HIR_BINARY({
        operator: '+',
        e1: HIR_VARIABLE('', HIR_INT_TYPE),
        e2: HIR_VARIABLE('', HIR_INT_TYPE),
      })
    )
  ).toEqual(
    HIR_BINARY({
      operator: '+',
      e1: HIR_BINARY({
        operator: '+',
        e1: HIR_VARIABLE('', HIR_INT_TYPE),
        e2: HIR_VARIABLE('', HIR_INT_TYPE),
      }),
      e2: HIR_VARIABLE('', HIR_INT_TYPE),
    })
  );

  expect(
    createHighIRFlexibleOrderOperatorNode(
      '+',
      IMMUTABLE_MEM(HIR_VARIABLE('', HIR_INT_TYPE)),
      HIR_ZERO
    )
  ).toEqual(
    HIR_BINARY({ operator: '+', e1: IMMUTABLE_MEM(HIR_VARIABLE('', HIR_INT_TYPE)), e2: HIR_ZERO })
  );
  expect(
    createHighIRFlexibleOrderOperatorNode(
      '+',
      IMMUTABLE_MEM(HIR_VARIABLE('', HIR_INT_TYPE)),
      HIR_NAME('b', HIR_INT_TYPE)
    )
  ).toEqual(
    HIR_BINARY({
      operator: '+',
      e1: IMMUTABLE_MEM(HIR_VARIABLE('', HIR_INT_TYPE)),
      e2: HIR_NAME('b', HIR_INT_TYPE),
    })
  );
  expect(
    createHighIRFlexibleOrderOperatorNode(
      '+',
      IMMUTABLE_MEM(HIR_VARIABLE('', HIR_INT_TYPE)),
      HIR_VARIABLE('b', HIR_INT_TYPE)
    )
  ).toEqual(
    HIR_BINARY({
      operator: '+',
      e1: IMMUTABLE_MEM(HIR_VARIABLE('', HIR_INT_TYPE)),
      e2: HIR_VARIABLE('b', HIR_INT_TYPE),
    })
  );
  expect(
    createHighIRFlexibleOrderOperatorNode(
      '+',
      IMMUTABLE_MEM(HIR_NAME('', HIR_INT_TYPE)),
      IMMUTABLE_MEM(HIR_VARIABLE('', HIR_INT_TYPE))
    )
  ).toEqual(
    HIR_BINARY({
      operator: '+',
      e1: IMMUTABLE_MEM(HIR_VARIABLE('', HIR_INT_TYPE)),
      e2: IMMUTABLE_MEM(HIR_NAME('', HIR_INT_TYPE)),
    })
  );
  expect(
    createHighIRFlexibleOrderOperatorNode(
      '+',
      IMMUTABLE_MEM(HIR_VARIABLE('', HIR_INT_TYPE), 1),
      IMMUTABLE_MEM(HIR_VARIABLE('', HIR_INT_TYPE), 0)
    )
  ).toEqual(
    HIR_BINARY({
      operator: '+',
      e1: IMMUTABLE_MEM(HIR_VARIABLE('', HIR_INT_TYPE), 1),
      e2: IMMUTABLE_MEM(HIR_VARIABLE('', HIR_INT_TYPE), 0),
    })
  );
  expect(
    createHighIRFlexibleOrderOperatorNode(
      '+',
      IMMUTABLE_MEM(HIR_VARIABLE('', HIR_INT_TYPE)),
      HIR_BINARY({
        operator: '+',
        e1: HIR_VARIABLE('', HIR_INT_TYPE),
        e2: HIR_VARIABLE('', HIR_INT_TYPE),
      })
    )
  ).toEqual(
    HIR_BINARY({
      operator: '+',
      e1: HIR_BINARY({
        operator: '+',
        e1: HIR_VARIABLE('', HIR_INT_TYPE),
        e2: HIR_VARIABLE('', HIR_INT_TYPE),
      }),
      e2: IMMUTABLE_MEM(HIR_VARIABLE('', HIR_INT_TYPE)),
    })
  );

  expect(
    createHighIRFlexibleOrderOperatorNode(
      '+',
      HIR_BINARY({
        operator: '+',
        e1: HIR_VARIABLE('', HIR_INT_TYPE),
        e2: HIR_VARIABLE('', HIR_INT_TYPE),
      }),
      HIR_ZERO
    )
  ).toEqual(
    HIR_BINARY({
      operator: '+',
      e1: HIR_BINARY({
        operator: '+',
        e1: HIR_VARIABLE('', HIR_INT_TYPE),
        e2: HIR_VARIABLE('', HIR_INT_TYPE),
      }),
      e2: HIR_ZERO,
    })
  );
  expect(
    createHighIRFlexibleOrderOperatorNode(
      '+',
      HIR_BINARY({
        operator: '+',
        e1: HIR_VARIABLE('', HIR_INT_TYPE),
        e2: HIR_VARIABLE('', HIR_INT_TYPE),
      }),
      HIR_BINARY({
        operator: '+',
        e1: HIR_VARIABLE('', HIR_INT_TYPE),
        e2: HIR_VARIABLE('', HIR_INT_TYPE),
      })
    )
  ).toEqual(
    HIR_BINARY({
      operator: '+',
      e1: HIR_BINARY({
        operator: '+',
        e1: HIR_VARIABLE('', HIR_INT_TYPE),
        e2: HIR_VARIABLE('', HIR_INT_TYPE),
      }),
      e2: HIR_BINARY({
        operator: '+',
        e1: HIR_VARIABLE('', HIR_INT_TYPE),
        e2: HIR_VARIABLE('', HIR_INT_TYPE),
      }),
    })
  );
  expect(
    createHighIRFlexibleOrderOperatorNode(
      '+',
      HIR_BINARY({
        operator: '+',
        e1: HIR_VARIABLE('', HIR_INT_TYPE),
        e2: HIR_VARIABLE('', HIR_INT_TYPE),
      }),
      HIR_BINARY({
        operator: '-',
        e1: HIR_VARIABLE('', HIR_INT_TYPE),
        e2: HIR_VARIABLE('', HIR_INT_TYPE),
      })
    )
  ).toEqual(
    HIR_BINARY({
      operator: '+',
      e1: HIR_BINARY({
        operator: '+',
        e1: HIR_VARIABLE('', HIR_INT_TYPE),
        e2: HIR_VARIABLE('', HIR_INT_TYPE),
      }),
      e2: HIR_BINARY({
        operator: '-',
        e1: HIR_VARIABLE('', HIR_INT_TYPE),
        e2: HIR_VARIABLE('', HIR_INT_TYPE),
      }),
    })
  );
  expect(
    createHighIRFlexibleOrderOperatorNode(
      '+',
      HIR_BINARY({
        operator: '+',
        e1: HIR_VARIABLE('a', HIR_INT_TYPE),
        e2: HIR_VARIABLE('', HIR_INT_TYPE),
      }),
      HIR_BINARY({
        operator: '+',
        e1: HIR_VARIABLE('', HIR_INT_TYPE),
        e2: HIR_VARIABLE('', HIR_INT_TYPE),
      })
    )
  ).toEqual(
    HIR_BINARY({
      operator: '+',
      e1: HIR_BINARY({
        operator: '+',
        e1: HIR_VARIABLE('a', HIR_INT_TYPE),
        e2: HIR_VARIABLE('', HIR_INT_TYPE),
      }),
      e2: HIR_BINARY({
        operator: '+',
        e1: HIR_VARIABLE('', HIR_INT_TYPE),
        e2: HIR_VARIABLE('', HIR_INT_TYPE),
      }),
    })
  );

  expect(createHighIRFlexibleOrderOperatorNode('-', HIR_ZERO, HIR_ONE)).toEqual(
    HIR_BINARY({ operator: '-', e1: HIR_ZERO, e2: HIR_ONE })
  );
});
