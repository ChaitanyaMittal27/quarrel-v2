import { SvgFrame, type SvgAssetProps } from '../primitives/SvgFrame'
import { deep } from '../primitives/portrait-colors'
import { Face, CurlyHair, Boots } from '../primitives/portrait'

function HeroInventor() {
  return <>
    <path d="M60 52H70V58H74V80H68V88H60Z" fill="#343752"/>
    <path d="M64 58H70V76H66V82H64Z" fill="#6775a0"/>
    <Boots suit="#414e71" light="#7d8db1"/>
    <path d="M30 56H64V62H70V84H64V92H30V86H26V66H30Z" fill="#343653"/>
    <path d="M34 58H60V64H66V82H60V88H34V82H30V68H34Z" fill="#7772b0"/>
    <path d="M36 60H42V82H36ZM56 64H60V82H56Z" fill="#aaa4da"/>
    <path d="M42 58H54V62H58V70H38V64H42Z" fill="#e4dfcc"/>
    <path d="M44 66H52V74H44Z" fill="#55c8c7"/>
    <path d="M28 82H66V88H28Z" fill="#bca66e"/>
    <path d="M32 80H40V90H32ZM54 80H62V90H54Z" fill="#d7c490"/>
    <path d="M34 82H38V86H34ZM56 82H60V86H56Z" fill="#84714f"/>
    <path d="M24 64H32V74H28V84H22V88H16V82H20V72H24Z" fill="#565d91"/>
    <path d="M16 82H24V88H28V94H16V90H14V86H16Z" fill="#b77957"/>
    <path d="M62 62H72V68H78V80H72V76H66V72H62Z" fill="#8f86c5"/>
    <path d="M72 74H80V80H84V86H76V84H72Z" fill="#b77957"/>
    <path d="M70 64H90V84H70Z" fill="#253441"/>
    <path d="M74 68H86V76H74Z" fill="#65cfc2"/><path d="M76 70H82V72H76ZM78 78H82V80H78Z" fill="#e8e6ba"/>
    <Face colors={deep}/><CurlyHair/>
    <path d="M26 28H70V34H26Z" fill="#c8b576"/>
    <path d="M30 26H44V36H30ZM50 26H64V36H50Z" fill="#242f45"/>
    <path d="M32 28H42V34H32ZM52 28H62V34H52Z" fill="#b6dce3"/>
    <path d="M32 28H36V30H32ZM52 28H56V30H52Z" fill="#ffffff"/>
    <path d="M44 30H50V32H44Z" fill="#f4d282"/>
    <path d="M32 54H40V60H56V54H64V60H58V64H40V62H34Z" fill="#444e70"/>
  </>;
}

export default function Asset(props: SvgAssetProps) {
  return <SvgFrame {...props}><path d="M22 106H76V108H82V110H16V108H22Z" fill="#202020" opacity=".22"/><g className="sprite-body"><HeroInventor/></g></SvgFrame>
}
