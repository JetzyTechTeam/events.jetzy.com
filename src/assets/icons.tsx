
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