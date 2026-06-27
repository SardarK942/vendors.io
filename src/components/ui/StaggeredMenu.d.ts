import type { ReactNode } from 'react';

export interface StaggeredMenuItem {
  label: string;
  link: string;
  ariaLabel?: string;
}

export interface StaggeredMenuSocialItem {
  label: string;
  link: string;
}

export interface StaggeredMenuProps {
  position?: 'left' | 'right';
  colors?: string[];
  items?: StaggeredMenuItem[];
  socialItems?: StaggeredMenuSocialItem[];
  displaySocials?: boolean;
  displayItemNumbering?: boolean;
  className?: string;
  logo?: ReactNode;
  logoUrl?: string;
  menuButtonColor?: string;
  openMenuButtonColor?: string;
  accentColor?: string;
  changeMenuColorOnOpen?: boolean;
  isFixed?: boolean;
  closeOnClickAway?: boolean;
  headerExtras?: ReactNode;
  onMenuOpen?: () => void;
  onMenuClose?: () => void;
}

export declare const StaggeredMenu: (props: StaggeredMenuProps) => JSX.Element;
export default StaggeredMenu;
