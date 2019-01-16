import postcss from 'postcss';
import selectorParser from 'postcss-selector-parser';
import valueParser from 'postcss-value-parser';
import {parser} from 'reduce-css-calc/dist/parser';
import reducer from 'reduce-css-calc/dist/lib/reducer';

const PLUGIN_NAME = 'deflock-math';

/**
 *
 */
export default postcss.plugin(PLUGIN_NAME, (opts = {}) => {
    const options = Object.assign({
        precision: 5,
        mediaQueries: false,
        selectors: false,
    }, opts);

    return (css, result) => {
        css.walk(node => {
            const {type} = node;

            if (type === 'decl') {
                transform(node, 'value', options, result);
            }
            else if (type === 'atrule' && options.mediaQueries) {
                transform(node, 'params', options, result);
            }
            else if (type === 'rule' && options.selectors) {
                transform(node, 'selector', options, result);
            }
        });
    };
});

/**
 * @param {Object} node
 * @param {string} property
 * @param {Object} options
 * @param {Object} result
 */
function transform(node, property, options, result) {
    node[property] = property === 'selector'
        ? transformSelector(node[property], options, result, node)
        : transformValue(node[property], options, result, node);
}

/**
 * @param {string} value
 * @param {Object} options
 * @param {Object} result
 * @param {Object} transformNode
 * @returns {string}
 */
function transformValue(value, options, result, transformNode) {
    return value ? processValue(value, options) : value;
}

/**
 * @param {string} value
 * @param {Object} options
 * @param {Object} result
 * @param {Object} transformNode
 * @returns {string}
 */
function transformSelector(value, options, result, transformNode) {
    return selectorParser(selectors => {
        selectors.walk(node => {
            // attribute value
            // e.g. the "math(3*3)" part of "div[data-size="math(3*3)"]"
            if (node.type === 'attribute') {
                const val = transformValue(node.raws.unquoted, options, result, transformNode);
                node.value = node.quoted ? '"' + val + '"' : val;
            }

            // tag value
            // e.g. the "math(3*3)" part of "div:nth-child(2n + math(3*3))"
            if (node.type === 'tag') {
                node.value = transformValue(node.value, options, result, transformNode);
            }
        });
    }).process(value).result.toString();
}

/**
 * @param {string} value
 * @param {Object} options
 * @returns {string}
 */
function processValue(value, options) {
    const parsed = valueParser(value);

    // Ignore top-level calc()
    // If top-level calc() must be processed wrap it with math()
    if (parsed.nodes && parsed.nodes.length === 1
        && parsed.nodes[0].type === 'function' && parsed.nodes[0].value === 'calc'
    ) {
        return value;
    }

    return parsed.walk(node => {
        if (node.type !== 'function' || !isSupportedFunction(node.value)) {
            return;
        }
        processCalcReduce(node, options);
    }, true).toString();
}

/**
 * @param {Object} functionNode
 * @param {Object} options
 * @return {void}
 */
function processCalcReduce(functionNode, options) {
    // stringify calc expression and produce an AST
    const content = valueParser.stringify(functionNode.nodes);

    const ast = parser.parse(content);

    // reduce AST to its simplest form, that is, either to a single value
    // or a simplified calc expression
    const reducedAst = reducer(ast, options.precision);

    if (reducedAst.type === 'MathExpression') {
        throw new Error(`Math expression ${valueParser.stringify(functionNode.nodes)} cannot been processed`);
    }

    let value = reducedAst.value;
    let unit = reducedAst.unit;
    let skipPrecision = false;

    switch (functionNode.value.toLowerCase()) {
        case 'abs':
            value = Math.abs(value);
            break;

        case 'ceil':
            value = Math.ceil(value);
            skipPrecision = true;
            break;
        case 'floor':
            value = Math.floor(value);
            skipPrecision = true;
            break;
        case 'round':
            value = Math.round(value);
            skipPrecision = true;
            break;

        case 'percentage':
            value *= 100;
            unit = '%';
            break;

        case 'math':
        case 'calc':
            // do nothing
            break;

        default:
            throw new Error(`Unknown math function: ${functionNode.value}`);
    }

    if (options.precision != null && !skipPrecision) {
        value = doPrecision(value, options.precision);
    }

    if (unit) {
        value += unit;
    }

    functionNode.type = 'word';
    functionNode.value = value;
}

/**
 * @param {number} value
 * @param {number} precision
 * @returns {number}
 */
function doPrecision(value, precision) {
    const p = 10 ** precision;
    return Math.round(value * p) / p;
}

/**
 * @param {string} name
 * @returns {boolean}
 */
function isSupportedFunction(name) {
    return /^(math|calc|abs|ceil|floor|round|percentage)$/i.test(name);
}
