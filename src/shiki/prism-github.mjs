// Shiki theme matching Prism's "github" theme (the Docusaurus default light code style).
export default {
  name: 'prism-github',
  type: 'light',
  colors: {
    'editor.background': '#f6f8fa',
    'editor.foreground': '#393a34',
  },
  tokenColors: [
    { settings: { foreground: '#393a34', background: '#f6f8fa' } },
    {
      scope: ['comment', 'punctuation.definition.comment'],
      settings: { foreground: '#999988', fontStyle: 'italic' },
    },
    {
      scope: ['string', 'string.quoted', 'punctuation.definition.string', 'markup.inline.raw', 'string.quoted.other.lt-gt.include'],
      settings: { foreground: '#e3116c' },
    },
    {
      scope: [
        'constant.numeric', 'constant.language', 'constant.character', 'constant.other',
        'variable.other.constant', 'support.constant', 'variable.other.enummember', 'markup.inserted',
      ],
      settings: { foreground: '#36acaa' },
    },
    {
      scope: [
        'keyword', 'keyword.control', 'keyword.other', 'storage', 'storage.type', 'storage.modifier',
        'keyword.control.directive', 'punctuation.definition.directive', 'meta.preprocessor',
        'entity.name.tag', 'entity.other.attribute-name', 'support.type.primitive', 'keyword.type',
      ],
      settings: { foreground: '#00009f' },
    },
    {
      scope: ['keyword.operator', 'punctuation', 'meta.brace'],
      settings: { foreground: '#393a34' },
    },
    {
      scope: ['entity.name.function', 'support.function', 'meta.function-call entity.name.function', 'markup.deleted'],
      settings: { foreground: '#d73a49' },
    },
  ],
};
