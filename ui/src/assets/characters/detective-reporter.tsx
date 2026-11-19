import { SvgFrame, type SvgAssetProps } from '../primitives/SvgFrame'
import { mono } from '../primitives/portrait-colors'
import { Face, Boots } from '../primitives/portrait'

function DetectiveReporter() {
  return <>
    <path d="M28 22H34V14H54V16H62V22H68V54H62V60H28V54H24V30H28Z" fill="#292929"/>
    <path d="M28 30H34V54H30V50H28ZM62 28H66V50H62Z" fill="#505050"/>
    <Boots suit="#414141" light="#6c6c6c" ink="#262626"/>
    <path d="M32 58H62V64H66V84H62V96H30V90H28V68H32Z" fill="#434343"/>
    <path d="M34 60H58V66H62V82H58V90H32V82H30V68H34Z" fill="#747474"/>
    <path d="M36 60H42V82H36ZM54 64H58V80H54Z" fill="#9f9f9f"/>
    <path d="M38 56H56V62H52V70H44V66H38Z" fill="#ebebeb"/>
    <path d="M44 62H50V68H48V80H44V68H42V64H44Z" fill="#282828"/>
    <path d="M30 84H62V90H30Z" fill="#2c2c2c"/><path d="M44 84H52V88H44Z" fill="#c4c4c4"/>
    <path d="M24 66H32V76H28V82H22V84H16V78H20V72H24Z" fill="#636363"/>
    <path d="M16 78H24V84H28V90H18V88H14V82H16Z" fill="#c2c2c2"/>
    <path d="M64 64H72V70H76V78H70V76H64Z" fill="#8c8c8c"/>
    <path d="M70 74H80V82H72V80H68V76H70Z" fill="#c2c2c2"/>
    <path d="M62 66H84V90H62Z" fill="#393939"/><path d="M66 68H80V86H66Z" fill="#e4e4e4"/>
    <path d="M68 72H78V74H68ZM68 78H76V80H68ZM68 84H74V86H68Z" fill="#a6a6a6"/>
    <path d="M82 62H86V84H82Z" fill="#606060"/><path d="M82 60H86V64H82Z" fill="#e1e1e1"/>
    <Face colors={{...mono,skin:"#c1c1c1",light:"#e1e1e1",shade:"#979797"}}/>
    <path d="M28 36H24V24H28V18H34V14H56V18H62V22H66V32H60V28H54V24H44V28H38V34H32V44H28Z" fill="#323232"/>
    <path d="M32 22H38V18H52V20H58V24H48V26H42V30H36V34H30V28H32Z" fill="#5d5d5d"/>
    <path d="M32 20H38V18H46V20H38V24H34V26H30V24H32Z" fill="#848484"/>
    <path d="M62 32H66V50H62V54H58V48H62Z" fill="#323232"/>
    <path d="M28 26H34V30H28Z" fill="#b3b3b3"/>
    <path d="M34 46H38V48H34ZM58 46H62V48H58Z" fill="#adadad"/>
  </>;
}

export default function Asset(props: SvgAssetProps) {
  return <SvgFrame {...props}><path d="M22 106H76V108H82V110H16V108H22Z" fill="#202020" opacity=".22"/><g className="sprite-body"><DetectiveReporter/></g></SvgFrame>
}
