export default {
  packagerConfig: {
    name: 'Minecraft Bedrock Minimap',
    executableName: 'minecraft-bedrock-minimap',
    icon: './build/icon',
    asar: true,
    overwrite: true,
    prune: true,
    extraResource: [
      './services'
    ],
    ignore: [
      /^\/\.git/,
      /^\/\.vscode/,
      /\.ts$/,
      /\.map$/,
      /^\/tsconfig\.json$/,
      /^\/\.eslintrc/,
      /^\/\.gitignore$/,
      /^\/forge\.config\.js$/,
      /^\/out\//,
      /^\/dist\//,
      /^\/\.env$/,
      /^\/services\//
    ]
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'minecraft_bedrock_minimap',
        authors: 'Minecraft Bedrock Minimap Team',
        description: 'Real-time minimap for Minecraft Bedrock Edition'
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux', 'win32']
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          maintainer: 'Minecraft Bedrock Minimap Team',
          homepage: 'https://github.com/minecraft-bedrock-minimap',
          categories: ['Game'],
          section: 'games',
          priority: 'optional',
          description: 'Real-time minimap for Minecraft Bedrock Edition'
        }
      }
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          homepage: 'https://github.com/minecraft-bedrock-minimap',
          categories: ['Game'],
          license: 'MIT',
          description: 'Real-time minimap for Minecraft Bedrock Edition'
        }
      }
    },
    {
      name: '@electron-forge/maker-dmg',
      config: {
        format: 'ULFO',
        overwrite: true,
        name: 'Minecraft Bedrock Minimap'
      }
    }
  ],
  plugins: [],
  publishers: []
};