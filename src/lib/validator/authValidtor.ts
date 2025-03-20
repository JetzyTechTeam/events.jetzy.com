import * as yup from "yup"

export const loginValidatorScheme = yup.object().shape({
  email: yup.string().email("Invalid email address.").required("Email is required."),
  password: yup
    .string()
    .required("Password is required")
    .trim("Password must not have empty space")
    .matches(/\w*[a-z]\w*/, "Password must have a small letter")
    .matches(/\w*[A-Z]\w*/, "Password must have a capital letter")
    .matches(/\d/, "Password must have a number")
    .matches(/[!@#$%^&*()\-_"=+{}; :,<.>]/, "Password must have a special character")
    .min(8, "Passowrd must be at least 8 characters long"),
})

export const signupValidation = yup.object().shape({
  firstName: yup.string().required("First name is required."),
  lastName: yup.string().required("Last name is required."),
  email: yup.string().email("Email must be a valid email address.").required("Email is required"),
  password: yup
    .string()
    .required("Password is required")
    .trim("Password must not have empty space")
    .matches(/\w*[a-z]\w*/, "Password must have a small letter")
    .matches(/\w*[A-Z]\w*/, "Password must have a capital letter")
    .matches(/\d/, "Password must have a number")
    .matches(/[!@#$%^&*()\-_"=+{}; :,<.>]/, "Password must have a special character")
    .min(8, "Passowrd must be at least 8 characters long"),

  confirmPassword: yup
    .string()
    .required("Confirm password is required")
    .oneOf([yup.ref("password")], "Password did not match."),
})

export const FgpwdValidatorScheme = yup.object().shape({
  email: yup.string().email("Invalid email address.").required("Email is required"),
})

export const OTPCodeValidatorScheme = yup.object().shape({
  otp: yup.string().matches(/\d+/, "OTP must be a number.").required("OTP is required."),
})

export const changePasswordValidatorScheme = yup.object().shape({
  newPassword: yup
    .string()
    .required("Password is required")
    .trim("Password must not have empty space")
    .matches(/\w*[a-z]\w*/, "Password must have a small letter")
    .matches(/\w*[A-Z]\w*/, "Password must have a capital letter")
    .matches(/\d/, "Password must have a number")
    .matches(/[!@#$%^&*()\-_"=+{}; :,<.>]/, "Password must have a special character")
    .min(8, "Passowrd must be at least 8 characters long"),
  confirm_password: yup
    .string()
    .required("Confirm password is required")
    .oneOf([yup.ref("newPassword")], "Confirm password must match password."),
})

export const onboardingSchema = yup.object().shape({
  firstName: yup.string().required("First name is required."),
  lastName: yup.string().required("Last name is required."),
  phone: yup.string().required("Phone number is required."),
})

export const setBusinessAccountPasswordValidatorScheme = yup.object().shape({
  password: yup
    .string()
    .required("Password is required")
    .trim("Password must not have empty space")
    .matches(/\w*[a-z]\w*/, "Password must have a small letter")
    .matches(/\w*[A-Z]\w*/, "Password must have a capital letter")
    .matches(/\d/, "Password must have a number")
    .matches(/[!@#$%^&*()\-_"=+{}; :,<.>]/, "Password must have a special character")
    .min(8, "Passowrd must be at least 8 characters long"),
  confirm_password: yup
    .string()
    .required("Confirm password is required")
    .oneOf([yup.ref("password")], "Confirm password must match password."),
})
