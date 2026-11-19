import { SvgFrame, type SvgAssetProps } from '../primitives/SvgFrame'
import { pale } from '../primitives/portrait-colors'
import { Face, Boots } from '../primitives/portrait'

function HeroScout() {
  return <>
    <path d="M30 52H62V62H68V78H72V98H56V92H44V100H18V94H24V72H28Z" fill="#7c3c59"/>
    <path d="M30 58H60V66H64V80H68V92H56V88H42V94H24V90H28V72H30Z" fill="#e27b76"/>
    <path d="M28 68H32V86H28V92H24V88H26Z" fill="#ffb795"/>
    <Boots suit="#294d62" light="#4c8c99"/>
    <path d="M30 58H64V64H68V78H62V90H32V84H28V66H30Z" fill="#24596b"/>
    <path d="M34 58H58V66H62V78H56V86H34V80H32V66H34Z" fill="#42a8ad"/>
    <path d="M36 62H42V80H36Z" fill="#7bdac8"/>
    <path d="M34 56H42V62H48V66H54V60H60V56H64V62H58V66H52V70H44V66H38V64H34Z" fill="#f5d888"/>
    <path d="M30 82H62V88H30Z" fill="#e9d798"/><path d="M46 82H52V88H46Z" fill="#fcf0c3"/>
    <path d="M26 62H34V72H30V82H24V88H16V80H20V72H24V66H26Z" fill="#2a7584"/>
    <path d="M16 80H24V86H26V92H16V88H14V84H16Z" fill="#e2ac8a"/>
    <path d="M62 62H70V66H76V60H82V66H78V74H72V78H64Z" fill="#3193a0"/>
    <path d="M74 56H82V60H86V66H80V70H74Z" fill="#e2ac8a"/>
    <path d="M78 50H88V54H92V60H88V62H76V58H74V54H78Z" fill="#243748"/>
    <path d="M82 52H88V58H82Z" fill="#88dfdf"/><path d="M84 52H88V54H84Z" fill="#e6f8ec"/>
    <path d="M58 20H72V26H78V40H82V56H74V66H64V56H60Z" fill="#783e43"/>
    <path d="M66 26H72V36H76V54H70V60H66V48H64V32H66Z" fill="#d97858"/>
    <Face colors={{...pale,hair:"#7c3d3a",hairLight:"#cd7351"}}/>
    <path d="M28 36H24V22H28V16H34V12H54V14H62V18H68V28H64V30H58V24H52V20H44V24H38V30H34V40H28Z" fill="#85403f"/>
    <path d="M30 22H34V18H42V16H54V18H60V22H52V20H44V26H38V30H32V34H28V28H30Z" fill="#df865c"/>
    <path d="M32 20H40V18H48V20H40V24H34V28H30V24H32Z" fill="#f7b77b"/>
    <path d="M30 34H34V46H30V42H28V36H30Z" fill="#85403f"/>
    <path d="M62 30H68V34H62Z" fill="#8be0c9"/>
    <path d="M36 52H42V56H56V52H60V58H56V62H42V60H36Z" fill="#f4a28a"/>
    <path d="M46 60H52V66H46Z" fill="#f5d888"/>
  </>;
}

export default function Asset(props: SvgAssetProps) {
  return <SvgFrame {...props}><path d="M22 106H76V108H82V110H16V108H22Z" fill="#202020" opacity=".22"/><g className="sprite-body"><HeroScout/></g></SvgFrame>
}
