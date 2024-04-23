import React, { useState, useEffect } from "react"

interface ProgressBarProps {
  progress: number // Percentage of completion (0-100)
  animationDuration?: number // Animation duration in milliseconds (optional, default 500)
  showPercentage?: boolean // Display percentage text within the bar (optional, default true)
}

const ProgressBar: React.FC<ProgressBarProps> = ({ progress, animationDuration = 500, showPercentage = true }) => {
  const [progressBarStyle, setProgressBarStyle] = useState({
    width: "0%",
  })
  const [percentageText, setPercentageText] = useState(`${progress}%`) // Initial percentage

  useEffect(() => {
    const newWidth = `${Math.min(Math.max(progress, 0), 100)}%` // Clamp progress to 0-100

    const animateProgress = () => {
      let currentWidth = 0
      const intervalId = setInterval(() => {
        if (currentWidth >= progress) {
          clearInterval(intervalId)
          return
        }
        currentWidth += 1
        setProgressBarStyle({ width: `${currentWidth}%` })
        setPercentageText(`${currentWidth}%`) // Update percentage text in real-time
      }, animationDuration / 100) // Animate in 100 steps
    }

    animateProgress()
  }, [progress, animationDuration])

  return (
    <div className="h-2 rounded-full overflow-hidden bg-gray-200 relative">
      <div className={`w-full h-full bg-blue-500 transition duration-${animationDuration}ms ease-linear absolute top-0 left-0`} style={progressBarStyle} />
      {showPercentage && <span className="absolute inset-0 flex justify-center items-center text-white font-bold text-sm">{percentageText}</span>}
    </div>
  )
}

export default ProgressBar
