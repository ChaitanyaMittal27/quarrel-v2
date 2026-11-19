import { SvgFrame, type SvgAssetProps } from '../primitives/SvgFrame'
import { deep } from '../primitives/portrait-colors'
import { Face, Boots } from '../primitives/portrait'

function AdvocateB() {
  return <>
    <path d="M28 24H32V16H40V12H56V16H64V22H68V50H64V58H28V54H24V32H28Z" fill="#3c3039"/>
    <path d="M28 32H32V50H28ZM62 28H66V48H62Z" fill="#725357"/>
    <Boots suit="#4f354a" light="#8c5d70" ink="#302c39"/>
    <path d="M30 58H64V64H68V84H64V96H30V90H26V66H30Z" fill="#643b52"/>
    <path d="M34 60H58V66H64V82H60V90H32V82H30V68H34Z" fill="#a35d72"/>
    <path d="M34 62H40V82H34ZM56 66H60V82H56Z" fill="#ce8995"/>
    <path d="M38 56H58V62H52V72H44V66H38Z" fill="#f0dcc1"/>
    <path d="M42 62H48V70H44V82H40V74H42ZM50 64H54V80H48V72H50Z" fill="#fff0d5"/>
    <path d="M30 86H64V90H30Z" fill="#754252"/><path d="M46 82H50V86H46ZM46 90H50V94H46Z" fill="#e5c68c"/>
    <path d="M24 64H32V74H28V84H22V88H16V82H20V72H24Z" fill="#8e4c67"/>
    <path d="M16 82H24V90H16V88H14V84H16Z" fill="#bd8867"/>
    <path d="M64 64H72V70H76V78H70V76H64Z" fill="#b87287"/>
    <path d="M70 74H80V82H72V80H68V76H70Z" fill="#bd8867"/>
    <path d="M62 68H84V94H62Z" fill="#284d50"/><path d="M66 70H80V90H66Z" fill="#548982"/>
    <path d="M66 70H70V90H66ZM74 76H78V78H74Z" fill="#d9c48a"/>
    <Face colors={{...deep,skin:"#bd8867",light:"#dfac85",shade:"#95604f"}}/>
    <path d="M28 36H24V26H28V20H32V14H42V12H56V16H64V22H68V32H62V28H56V24H48V22H42V28H36V34H32V44H28Z" fill="#49333d"/>
    <path d="M30 24H34V20H40V16H50V18H56V20H60V24H50V22H44V26H38V32H32V36H28V30H30Z" fill="#855b5d"/>
    <path d="M34 20H40V18H46V20H40V24H36V28H32V26H34Z" fill="#b07a72"/>
    <path d="M28 44H32V48H28ZM64 42H68V46H64Z" fill="#e4c580"/>
    <path d="M38 54H44V58H54V54H60V60H54V62H44V60H38Z" fill="#f2ddbe"/>
  </>;
}

export default function Asset(props: SvgAssetProps) {
  return <SvgFrame {...props}><path d="M22 106H76V108H82V110H16V108H22Z" fill="#202020" opacity=".22"/><g className="sprite-body"><AdvocateB/></g></SvgFrame>
}
