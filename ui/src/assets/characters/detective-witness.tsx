import { SvgFrame, type SvgAssetProps } from '../primitives/SvgFrame'
import { mono } from '../primitives/portrait-colors'
import { Face, CurlyHair, Boots } from '../primitives/portrait'

function DetectiveWitness() {
  return <>
    <Boots suit="#5c5c5c" light="#8c8c8c" ink="#282828"/>
    <path d="M30 58H64V64H70V86H64V94H30V88H26V68H30Z" fill="#4a4a4a"/>
    <path d="M34 58H58V64H64V84H58V90H34V84H30V70H34Z" fill="#d2d2d2"/>
    <path d="M30 60H38V74H44V90H30V82H28V68H30ZM56 60H64V70H66V86H60V92H52V76H56Z" fill="#787878"/>
    <path d="M32 64H36V76H40V86H34V80H32ZM58 64H62V76H60V84H56V76H58Z" fill="#989898"/>
    <path d="M40 58H56V64H50V68H46V64H40Z" fill="#ebebeb"/>
    <path d="M44 64H52V70H44Z" fill="#616161"/><path d="M46 70H50V84H46Z" fill="#757575"/>
    <path d="M46 78H50V82H46ZM46 86H50V90H46Z" fill="#e3e3e3"/>
    <path d="M56 78H62V80H60V84H54V82H56Z" fill="#c0c0c0"/>
    <path d="M24 64H30V72H26V84H20V88H14V82H18V72H22V68H24Z" fill="#c6c6c6"/>
    <path d="M16 82H24V90H16V88H14V84H16Z" fill="#a8a8a8"/>
    <path d="M66 64H74V70H78V84H72V78H68V74H66Z" fill="#d2d2d2"/>
    <path d="M72 82H80V90H72Z" fill="#a8a8a8"/>
    <path d="M70 88H76V84H84V88H90V106H66V88H70ZM76 86V90H82V86Z" fill="#2f2f2f" fillRule="evenodd"/>
    <path d="M70 92H86V102H70Z" fill="#5e5e5e"/><path d="M76 92H80V96H76Z" fill="#b4b4b4"/>
    <Face colors={{...mono,skin:"#aeaeae",light:"#cbcbcb",shade:"#7e7e7e"}} smile={false}/>
    <CurlyHair color="#404040" highlight="#6d6d6d"/>
    <path d="M32 34H42V36H32ZM54 32H64V34H54Z" fill="#3f3f3f"/>
    <path d="M38 54H44V58H54V54H60V60H54V64H44V62H38Z" fill="#d4d4d4"/>
  </>;
}

export default function Asset(props: SvgAssetProps) {
  return <SvgFrame {...props}><path d="M22 106H76V108H82V110H16V108H22Z" fill="#202020" opacity=".22"/><g className="sprite-body"><DetectiveWitness/></g></SvgFrame>
}
