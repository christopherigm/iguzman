const path = require('path');

module.exports = {
  sassOptions: {
    includePaths: [path.join(__dirname, 'styles')],
  },
  transpilePackages: ['@repo/ui', '@repo/utils'],
  experimental: {
    swcPlugins: [['@preact-signals/safe-react/swc', {}]],
  },
};
