import {Menu} from '@base-ui/react/menu';
import {Check,MoreHorizontal} from 'lucide-react';

/** The pin's ⋯ menu: the less common actions, so the card shows only Looks right and Suggest a spot. */
export interface MenuItem {label:string;onSelect:()=>void;checked?:boolean;danger?:boolean}
export function PinMenu({items}:{items:MenuItem[]}){
 if(!items.length)return null;
 return <Menu.Root>
  <Menu.Trigger className="card-x pin-menu-trigger" aria-label="More options"><MoreHorizontal size={18}/></Menu.Trigger>
  <Menu.Portal><Menu.Positioner className="pin-menu-pos" side="bottom" align="end" sideOffset={6}>
   <Menu.Popup className="panel pin-menu">
    {items.map(i=><Menu.Item key={i.label} className={`pin-menu-item ${i.danger?'is-danger':''}`} onClick={i.onSelect}>{i.label}{i.checked&&<Check size={15} className="pin-menu-check"/>}</Menu.Item>)}
   </Menu.Popup>
  </Menu.Positioner></Menu.Portal>
 </Menu.Root>;
}
