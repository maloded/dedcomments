import { Injectable } from '@nestjs/common';

@Injectable()
export class SanitizerService {
	// step 2: strip everything except <a href title>, <code>, <i>, <strong>;
	// verify the markup is well-formed (valid XHTML, tags properly closed);
	// this is the primary XSS defence for comment text.
}
