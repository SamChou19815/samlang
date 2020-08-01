/**
 * The universal exception thrown by SAMLANG programs.
 * The name `panic` is inspired by Go.
 * The reason for panic is always required.
 *
 * @param reason the reason of this exception.
 */
export default class PanicException extends Error {
  constructor(reason: string) {
    super(reason);
  }
}
