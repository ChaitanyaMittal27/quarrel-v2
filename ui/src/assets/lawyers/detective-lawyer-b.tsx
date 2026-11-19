import { SvgFrame, type SvgAssetProps } from '../primitives/SvgFrame'
import { noirB } from '../primitives/counsel-colors'
import { CounselSuit, HumanHead } from '../primitives/counsel'

function NoirCounselB() { return <><path d="M15 12H33V30H29V27H17V29H13V17H15Z" fill={noirB.hair}/><CounselSuit p={noirB}/><HumanHead p={noirB} curls glasses/><path d="M14 31H17V44H14ZM30 31H33V36H30Z" fill="#cfcfcf"/></>; }

export default function Asset(props: SvgAssetProps) {
  return <SvgFrame {...props}><g className="sprite-body"><g transform="scale(2)"><NoirCounselB/></g></g></SvgFrame>
}
