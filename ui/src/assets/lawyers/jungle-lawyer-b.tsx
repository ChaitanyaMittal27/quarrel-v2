import { SvgFrame, type SvgAssetProps } from '../primitives/SvgFrame'
import { capybara } from '../primitives/counsel-colors'
import { CounselSuit } from '../primitives/counsel'

function CapybaraCounsel() {
  return <>
    <CounselSuit p={capybara}/>
    <path d="M13 10H17V8H21V10H29V8H33V11H36V23H33V27H29V29H18V27H13V23H11V13H13Z" fill={capybara.shade}/>
    <path d="M14 13H19V11H29V12H33V15H34V22H31V25H28V27H19V25H15V22H13V16H14Z" fill={capybara.skin}/>
    <path d="M16 13H20V12H29V14H31V20H28V22H18V20H15V16H16Z" fill={capybara.light}/>
    <path d="M14 10H17V13H14ZM30 10H33V13H30Z" fill="#d49a72"/>
    <path d="M16 17H20V20H16ZM28 17H32V20H28Z" fill="#333e35"/><path d="M16 17H17V18H16ZM28 17H29V18H28Z" fill="#fff1cc"/>
    <path d="M18 20H29V22H31V25H28V27H20V25H17V22H18Z" fill="#e6bb89"/>
    <path d="M22 21H26V23H22Z" fill="#6e503d"/><g className="sprite-mouth"><path d="M20 25H23V24H25V25H28V26H20Z" fill="#79553b"/></g>
    <path d="M16 15H20V16H16ZM28 15H32V16H28Z" fill="#79553b"/>
  </>;
}

export default function Asset(props: SvgAssetProps) {
  return <SvgFrame {...props}><g className="sprite-body"><g transform="scale(2)"><CapybaraCounsel/></g></g></SvgFrame>
}
