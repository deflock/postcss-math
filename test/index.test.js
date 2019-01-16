'use strict';

const postcss = require('postcss');
const plugin = require('..').default;

process.chdir(__dirname);

/**
 * @param {string} input
 * @param {string} expected
 * @param {Object} pluginOptions
 * @param {Object} postcssOptions
 * @param {Array} warnings
 * @returns {Promise}
 */
function run(input, expected, pluginOptions = {}, postcssOptions = {}, warnings = []) {
    return postcss([plugin(pluginOptions)])
        .process(input, Object.assign({from: 'input.css'}, postcssOptions))
        .then((result) => {
            const resultWarnings = result.warnings();
            resultWarnings.forEach((warning, index) => {
                expect(warnings[index]).toEqual(warning.text);
            });
            expect(resultWarnings.length).toEqual(warnings.length);
            expect(result.css).toEqual(expected);
            return result;
        });
}

it('should work', () => {
    run(
        'a { width: abs(-5px) }',
        'a { width: 5px }'
    );
    run(
        'a { width: ceil(4.2px) }',
        'a { width: 5px }'
    );
    run(
        'a { width: floor(5.7px) }',
        'a { width: 5px }'
    );
    run(
        'a { width: round(4.5px) }',
        'a { width: 5px }'
    );
    run(
        'a { width: percentage(0.15) }',
        'a { width: 15% }'
    );
});
