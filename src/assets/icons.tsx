export const LocationSVG = (props: {
  width?: number;
  height?: number;
  stroke?: string;
}) => {
  const width = props.width?? 19;
  const height = props.height?? 20;
  const stroke = props.stroke?? "#8C9094";
  return (
<svg width={width} height={height} viewBox="0 0 19 20" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M9.5 10.5938C10.8117 10.5938 11.875 9.53043 11.875 8.21875C11.875 6.90707 10.8117 5.84375 9.5 5.84375C8.18832 5.84375 7.125 6.90707 7.125 8.21875C7.125 9.53043 8.18832 10.5938 9.5 10.5938Z" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
<path d="M15.4375 8.21875C15.4375 13.5625 9.5 17.7188 9.5 17.7188C9.5 17.7188 3.5625 13.5625 3.5625 8.21875C3.5625 6.64403 4.18806 5.1338 5.30155 4.0203C6.41505 2.90681 7.92528 2.28125 9.5 2.28125C11.0747 2.28125 12.5849 2.90681 13.6984 4.0203C14.8119 5.1338 15.4375 6.64403 15.4375 8.21875V8.21875Z" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
</svg>

  )
}
export const DateTimeSVG = (props: {
  width?: number;
  height?: number;
  stroke?: string;
}) => {
  const width = props.width?? 20;
  const height = props.height?? 20;
  const stroke = props.stroke?? "#8C9094";
  return (
    <svg width={width} height={height} viewBox="0 0 19 20" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M9.5 17.125C13.435 17.125 16.625 13.935 16.625 10C16.625 6.06497 13.435 2.875 9.5 2.875C5.56497 2.875 2.375 6.06497 2.375 10C2.375 13.935 5.56497 17.125 9.5 17.125Z" stroke={stroke} strokeWidth="1.3" strokeMiterlimit="10"/>
      <path d="M9.5 5.84375V10H13.6562" stroke={stroke} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>

  )
}

export const ChevronRightSVG = (props: {
  stroke?: string;
  height?: number;
  width?: number;
}) => {
  const stroke = props.stroke ?? "#F79432";
  const height = props.height ?? 20;
  const width = props.width ?? 20;
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M7.5 15L12.5 10L7.5 5"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};


export const ChevronLeftSVG = (props: {
  width?: number;
  height?: number;
  stroke?: string;
}) => {
  const width = props.width ?? 26;
  const height = props.height ?? 26;
  const stroke = props.stroke ?? "#8C9094";
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 26 26"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M16.25 19.5L9.75 13L16.25 6.5"
        stroke={stroke}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};