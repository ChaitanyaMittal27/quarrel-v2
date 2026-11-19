import { SvgFrame, type SvgAssetProps } from '../primitives/SvgFrame'
import { deep } from '../primitives/portrait-colors'
import { Face, ShortHair, Boots, Gavel } from '../primitives/portrait'

function HeroRook() {
  return <>
    <path d="M30 50H64V60H70V74H74V92H82V102H58V96H46V102H18V96H22V78H26V62H30Z" fill="#142b3c"/>
    <path d="M30 56H62V64H66V84H72V96H58V90H46V96H24V88H28V68H30Z" fill="#cda64e"/>
    <path d="M32 60H40V92H28V84H30Z" fill="#f5cf70"/>
    <Boots suit="#294b56" light="#43878a"/>
    <path d="M32 54H62V58H68V70H64V88H32V84H28V64H32Z" fill="#193a48"/>
    <path d="M36 56H58V62H62V80H58V88H34V78H32V64H36Z" fill="#2b7b7b"/>
    <path d="M36 58H44V78H38V84H34V68H36Z" fill="#51b9ac"/>
    <path d="M32 58H40V62H46V66H50V62H58V58H64V66H58V68H52V72H44V68H38V66H32Z" fill="#f1c65d"/>
    <path d="M42 72H54V76H50V80H46V76H42Z" fill="#e9d58a"/>
    <path d="M30 84H64V90H30Z" fill="#e3b955"/><path d="M44 84H52V90H44Z" fill="#f9e7aa"/>
    <path d="M26 60H34V70H30V82H26V88H18V80H22V70H26Z" fill="#245761"/>
    <path d="M20 80H28V86H30V92H20V88H18V84H20Z" fill="#d19a70"/>
    <path d="M64 60H70V66H76V62H82V70H78V76H68V72H62Z" fill="#367f80"/>
    <Gavel wood="#d2a54f" shine="#fae4a0" outline="#293947"/>
    <path d="M74 62H82V68H86V74H78V72H74Z" fill="#d19a70"/>
    <Face colors={deep}/><ShortHair color="#263239" highlight="#4d6264"/>
    <path d="M30 34H44V36H50V34H66V44H62V46H52V42H44V46H34V42H30Z" fill="#1b5158"/>
    <path d="M34 36H42V42H34ZM54 36H62V42H54Z" fill="#f8e7a4"/>
    <path d="M38 36H42V42H38ZM54 36H58V42H54Z" fill="#23303e"/>
    <path d="M34 32H44V34H34ZM52 32H64V34H52Z" fill="#58c5b5"/>
    <path d="M34 54H42V58H54V54H62V60H56V64H42V62H36Z" fill="#f0ce70"/>
  </>;
}

export default function Asset(props: SvgAssetProps) {
  return <SvgFrame {...props}><path d="M22 106H76V108H82V110H16V108H22Z" fill="#202020" opacity=".22"/><g className="sprite-body"><HeroRook/></g></SvgFrame>
}
