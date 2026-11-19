import { SvgFrame, type SvgAssetProps } from '../primitives/SvgFrame'
import { pale } from '../primitives/portrait-colors'
import { Face, ShortHair, Boots } from '../primitives/portrait'

function AdvocateA() {
  return <>
    <Boots suit="#35495f" light="#627b8b" ink="#25313c"/>
    <path d="M30 56H64V62H70V84H64V94H30V88H26V66H30Z" fill="#253c54"/>
    <path d="M34 58H58V64H64V82H58V90H34V82H30V68H34Z" fill="#41617b"/>
    <path d="M34 62H40V82H34ZM56 66H60V84H56Z" fill="#7390a2"/>
    <path d="M38 56H58V62H52V72H44V66H38Z" fill="#f2e5cc"/>
    <path d="M44 62H52V68H50V82H44V68H42V64H44Z" fill="#b15c4d"/>
    <path d="M34 56H40V64H44V72H40V78H34V70H30V62H34ZM58 56H64V66H60V74H54V78H50V72H56V64H58Z" fill="#8aabbb"/>
    <path d="M30 84H64V88H30Z" fill="#253b4e"/>
    <path d="M46 84H50V88H46ZM46 76H50V80H46Z" fill="#e4c584"/>
    <path d="M24 62H32V72H28V84H22V88H16V82H20V72H24Z" fill="#38576f"/>
    <path d="M16 82H24V90H16V88H14V84H16Z" fill="#dfb690"/>
    <path d="M64 62H72V68H76V80H70V76H66V70H64Z" fill="#50718b"/>
    <path d="M70 76H80V84H72V82H68V78H70Z" fill="#dfb690"/>
    <path d="M64 70H86V94H64Z" fill="#6b4937"/><path d="M68 72H82V90H68Z" fill="#d3af71"/>
    <path d="M70 76H80V78H70ZM70 82H78V84H70Z" fill="#f2db9f"/>
    <Face colors={{...pale,hair:"#866338",hairLight:"#c7a264"}}/>
    <ShortHair color="#896639" highlight="#d3ac66"/>
    <path d="M34 18H40V16H50V18H42V20H36V24H32V22H34Z" fill="#f5d293"/>
    <path d="M36 54H44V58H54V54H60V60H54V62H44V60H38Z" fill="#f8ecd7"/>
  </>;
}

export default function Asset(props: SvgAssetProps) {
  return <SvgFrame {...props}><path d="M22 106H76V108H82V110H16V108H22Z" fill="#202020" opacity=".22"/><g className="sprite-body"><AdvocateA/></g></SvgFrame>
}
