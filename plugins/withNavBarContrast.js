const { withAndroidStyles } = require('@expo/config-plugins');

module.exports = function withNavBarContrast(config) {
  return withAndroidStyles(config, (config) => {
    const appTheme = config.modResults.resources.style?.find(
      (s) => s.$.name === 'AppTheme'
    );
    if (appTheme) {
      appTheme.item = appTheme.item ?? [];

      appTheme.item = appTheme.item.filter(
        (i) => i.$.name !== 'android:enforceNavigationBarContrast'
      );
      appTheme.item.push({
        $: { name: 'android:enforceNavigationBarContrast' },
        _: 'false',
      });

      appTheme.item = appTheme.item.filter(
        (i) => i.$.name !== 'android:navigationBarColor'
      );
      appTheme.item.push({
        $: { name: 'android:navigationBarColor' },
        _: '@android:color/transparent',
      });
    }
    return config;
  });
};