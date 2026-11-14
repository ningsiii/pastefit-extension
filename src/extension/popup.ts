import { mountSettingsPanel } from '../ui/settings-panel';
import { mountFormulaSettings } from '../ui/formula-settings';
const root = document.querySelector<HTMLElement>('#app')!;
void mountSettingsPanel(root).then(async () => {
  await mountFormulaSettings(root);
  root.append(root.querySelector('footer')!);
});
