import { SvgFrame, type SvgAssetProps } from '../primitives/SvgFrame'
import { mono } from '../primitives/portrait-colors'
import { Face, ShortHair, Boots } from '../primitives/portrait'

function Fedora() {
  return <>
    <path d="M28 24H32V12H38V8H58V12H64V24H72V28H76V32H24V28H20V24Z" fill="#282828"/>
    <path d="M34 14H40V12H56V16H60V24H34Z" fill="#646464"/>
    <path d="M38 14H44V12H54V16H58V20H36V18H38Z" fill="#868686"/>
    <path d="M32 22H64V26H32Z" fill="#1c1c1c"/>
    <path d="M24 26H70V28H24Z" fill="#979797"/>
    <path d="M28 30H68V34H28Z" fill="#454545"/>
  </>;
}

function DetectiveVale() {
  return <>
    <Boots suit="#424242" light="#6f6f6f" ink="#212121"/>
    <path d="M30 54H64V60H70V80H74V100H54V92H44V100H24V94H26V70H30Z" fill="#3b3b3b"/>
    <path d="M32 58H60V64H66V84H68V96H54V90H44V96H28V80H30V66H32Z" fill="#949494"/>
    <path d="M32 62H38V92H30V80H32ZM56 66H62V90H58Z" fill="#b7b7b7"/>
    <path d="M38 56H58V62H54V72H42V66H38Z" fill="#e1e1e1"/>
    <path d="M46 62H52V68H50V82H44V68H46Z" fill="#353535"/>
    <path d="M32 56H38V64H44V72H40V78H34V72H30V62H32ZM58 56H64V64H60V74H54V78H50V72H56V64H58Z" fill="#cecece"/>
    <path d="M28 82H68V88H28Z" fill="#656565"/><path d="M44 82H52V88H44Z" fill="#d0d0d0"/><path d="M46 84H50V86H46Z" fill="#565656"/>
    <path d="M24 64H32V76H28V86H20V80H22V70H24Z" fill="#808080"/>
    <path d="M18 82H28V90H18V88H16V84H18Z" fill="#b8b8b8"/>
    <path d="M64 64H72V70H78V68H82V78H76V82H66V76H62Z" fill="#a7a7a7"/>
    <path d="M74 66H82V72H86V78H80V80H74Z" fill="#b8b8b8"/>
    <path d="M80 48H84V70H78V64H80Z" fill="#2a2a2a"/>
    <path d="M74 34H84V38H90V48H86V54H74V50H70V38H74Z" fill="#2b2b2b"/>
    <path d="M76 38H84V42H86V48H76V46H74V40H76Z" fill="#cacaca"/>
    <path d="M76 38H82V40H78V44H76Z" fill="#f2f2f2"/>
    <Face colors={mono} smile={false}/><ShortHair color="#393939" highlight="#676767"/>
    <path d="M50 32H64V42H60V48H56V50H50Z" fill="#616161" opacity=".34"/>
    <path d="M32 34H44V36H32ZM52 32H64V34H52Z" fill="#292929"/>
    <Fedora/>
    <path d="M36 54H42V58H46V62H42V64H36Z" fill="#aaaaaa"/>
  </>;
}

export default function Asset(props: SvgAssetProps) {
  return <SvgFrame {...props}><path d="M22 106H76V108H82V110H16V108H22Z" fill="#202020" opacity=".22"/><g className="sprite-body"><DetectiveVale/></g></SvgFrame>
}
