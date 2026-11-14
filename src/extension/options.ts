import { mountSiteManager } from '../ui/site-manager';
import { mountFormulaSettings } from '../ui/formula-settings';
const root = document.querySelector<HTMLElement>('#app')!;
void mountSiteManager(root).then(() => mountFormulaSettings(root));
