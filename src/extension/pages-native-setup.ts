import { mountMacSetup } from '../ui/mac-setup';
declare const __PASTEFIT_INSTALLER_URL__: string;
mountMacSetup(document.querySelector<HTMLElement>('#setup')!, { installerUrl: __PASTEFIT_INSTALLER_URL__ });
