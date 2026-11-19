import { SvgFrame, type SvgAssetProps } from '../primitives/SvgFrame'
import { deep } from '../primitives/portrait-colors'
import { Face, CurlyHair, Boots, Gavel } from '../primitives/portrait'

function CourtJudge() {
  return <>
    <Boots suit="#393949" light="#656277" ink="#232532"/>
    <path d="M30 54H64V60H70V80H76V102H66V106H28V102H22V80H26V62H30Z" fill="#272b3b"/>
    <path d="M32 60H40V98H28V92H26V80H30V68H32ZM56 60H64V72H68V96H64V102H56Z" fill="#444457"/>
    <path d="M32 68H36V92H32ZM60 74H64V94H60Z" fill="#656073"/>
    <path d="M36 54H60V60H56V68H42V64H36Z" fill="#f1e6d1"/>
    <path d="M42 60H46V82H40V72H42ZM50 62H54V82H48V72H50Z" fill="#fff4e0"/>
    <path d="M44 82H52V88H44Z" fill="#a64d4f"/>
    <path d="M24 68H32V78H28V88H20V82H22V74H24Z" fill="#3c3e51"/>
    <path d="M18 84H28V92H18V90H16V86H18Z" fill="#a36e54"/>
    <path d="M64 66H72V70H76V64H82V74H78V80H68V76H64Z" fill="#4b495e"/>
    <Gavel/>
    <path d="M74 64H82V70H86V76H78V74H74Z" fill="#a36e54"/>
    <Face colors={{...deep,skin:"#a36e54",light:"#c59070",shade:"#704b43"}} smile={false}/>
    <CurlyHair color="#37323c" highlight="#6c5d65"/>
    <path d="M26 28H30V36H26ZM64 22H68V30H64ZM58 16H62V20H58Z" fill="#c5bdba"/>
    <path d="M30 34H44V44H30ZM50 34H64V44H50Z" fill="#bfa666"/>
    <path d="M32 36H42V42H32ZM52 36H62V42H52Z" fill="#e2c7ac"/>
    <path d="M38 36H42V42H38ZM52 36H56V42H52Z" fill="#302d3b"/>
    <path d="M44 36H50V38H44Z" fill="#d7ba76"/>
    <path d="M30 34H34V36H30ZM50 34H54V36H50Z" fill="#f6e1aa"/>
  </>;
}

export default function Asset(props: SvgAssetProps) {
  return <SvgFrame {...props}><path d="M22 106H76V108H82V110H16V108H22Z" fill="#202020" opacity=".22"/><g className="sprite-body"><CourtJudge/></g></SvgFrame>
}
